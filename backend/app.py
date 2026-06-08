from flask import Flask, request, jsonify, send_from_directory
import os
import re
import io
import secrets
from functools import wraps
from werkzeug.utils import secure_filename
from flask_cors import CORS
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from models import db, Environment, Location, Equipment, MaintenanceOverride, MaintenanceHistory, PendingReview, CorrectionLog
import pandas as pd
import pdfplumber
import fitz  # PyMuPDF
import docx
import requests
import json
import uuid
import threading
from sqlalchemy import text
from dateutil.relativedelta import relativedelta
from datetime import datetime, date

# LM Studio defaults to http://localhost:1234
AI_API_BASE = os.getenv("AI_API_BASE", "http://localhost:1234")
AI_API_KEY = os.getenv("AI_API_KEY", "lm-studio")
AI_MODEL = os.getenv("AI_MODEL", "local-model") # LM studio ignores this and uses the loaded model
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
ADMIN_TOKEN_MAX_AGE = int(os.getenv("ADMIN_TOKEN_MAX_AGE", "28800"))

app = Flask(__name__)
UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///maintenance.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "maintenance-scheduling-dev-secret")

CORS(app)
db.init_app(app)
admin_serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'], salt='admin-auth')

def create_admin_token(username):
    return admin_serializer.dumps({'username': username})

def verify_admin_token(token):
    try:
        data = admin_serializer.loads(token, max_age=ADMIN_TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    if data.get('username') != ADMIN_USERNAME:
        return None
    return data

def require_admin_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.replace('Bearer ', '', 1).strip() if auth_header.startswith('Bearer ') else ''
        if not token or not verify_admin_token(token):
            return jsonify({'error': 'Admin authentication required'}), 401
        return fn(*args, **kwargs)
    return wrapper

def seed_database():
    with app.app_context():
        try:
            db.session.execute(text("ALTER TABLE equipments ADD COLUMN classification_status VARCHAR(20) DEFAULT NULL;"))
            db.session.execute(text("ALTER TABLE equipments ADD COLUMN ai_confidence FLOAT DEFAULT NULL;"))
            db.session.execute(text("ALTER TABLE equipments ADD COLUMN ai_reason TEXT DEFAULT NULL;"))
            db.session.execute(text("ALTER TABLE equipments ADD COLUMN ai_predicted_env VARCHAR(50) DEFAULT NULL;"))
            db.session.commit()
        except Exception:
            db.session.rollback()
            
        migrations = [
            "ALTER TABLE equipments ADD COLUMN serial_number VARCHAR(100);",
            "ALTER TABLE equipments ADD COLUMN standby INTEGER DEFAULT 0;",
            "ALTER TABLE equipments ADD COLUMN standby_since DATETIME;",
            "ALTER TABLE environments ADD COLUMN description TEXT;",
            "ALTER TABLE equipments ADD COLUMN location VARCHAR(50);"
        ]
        
        for statement in migrations:
            try:
                db.session.execute(text(statement))
                db.session.commit()
            except Exception:
                db.session.rollback()

        try:
            db.session.execute(text("UPDATE environments SET description = 'Equipment used directly in engine or powertrain test cells. Includes engine dynamometers, actuators, sensors, test rigs, and cell-specific cooling and pump systems.' WHERE id = 1 AND (description IS NULL OR description = '');"))
            db.session.execute(text("UPDATE environments SET description = 'Equipment used for full-vehicle chassis dynamometer testing. Includes roller sets, restraint systems, VECON control computers, locking devices, centering devices, and load cells.' WHERE id = 2 AND (description IS NULL OR description = '');"))
            db.session.execute(text("UPDATE environments SET description = 'Shared utility infrastructure serving multiple test cells. Includes central cooling, shared pumps, compressed air supply, electrical distribution, HVAC, and facility-wide systems.' WHERE id = 3 AND (description IS NULL OR description = '');"))
            db.session.commit()
        except Exception:
            db.session.rollback()
        
        db.create_all()
        if not Environment.query.first():
            db.session.add_all([
                Environment(name="Test Bed"),
                Environment(name="Chassis Dyno"),
                Environment(name="Common Facilities")
            ])
            db.session.commit()
        if not Location.query.first():
            env_by_name = {e.name: e for e in Environment.query.all()}
            default_locations = {
                "Test Bed": ["E-TB12", "E-TB17", "B-TB18"],
                "Chassis Dyno": ["PE-TB19"],
                "Common Facilities": ["X-TB21", "X-TB22"]
            }
            for env_name, codes in default_locations.items():
                env = env_by_name.get(env_name)
                if env:
                    for code in codes:
                        db.session.add(Location(code=code, environment_id=env.id))
            db.session.commit()

def calculate_next_maintenance(last_date, freq_type, freq_days=0, freq_months=0, freq_years=0):
    if freq_type == 'Daily':
        return last_date + relativedelta(days=1)
    elif freq_type == 'Weekly':
        return last_date + relativedelta(weeks=1)
    elif freq_type == 'Monthly':
        return last_date + relativedelta(months=1)
    elif freq_type == 'Yearly':
        return last_date + relativedelta(years=1)
    elif freq_type == 'Half Yearly':
        return last_date + relativedelta(months=6)
    elif freq_type == 'Custom':
        return last_date + relativedelta(years=freq_years, months=freq_months, days=freq_days)
    return last_date # fallback

def get_next_actual_maintenance(eq):
    theoretical = calculate_next_maintenance(
        eq.last_maintenance_date, eq.freq_type, eq.freq_days, eq.freq_months, eq.freq_years
    )
    override = MaintenanceOverride.query.filter_by(equipment_id=eq.id, original_date=theoretical).first()
    return override.new_date if override else theoretical

@app.route('/api/environments', methods=['GET'])
def get_environments():
    envs = Environment.query.all()
    return jsonify([{
        'id': e.id,
        'name': e.name,
        'description': e.description,
        'locations': [
            {'id': loc.id, 'code': loc.code, 'description': loc.description}
            for loc in sorted(e.locations, key=lambda item: item.code)
        ]
    } for e in envs])

@app.route('/api/locations', methods=['GET'])
def get_locations():
    env_id = request.args.get('environment_id')
    query = Location.query
    if env_id:
        query = query.filter_by(environment_id=env_id)
    locations = query.order_by(Location.code.asc()).all()
    return jsonify([{
        'id': loc.id,
        'code': loc.code,
        'description': loc.description,
        'environment_id': loc.environment_id,
        'environment_name': loc.environment.name if loc.environment else None
    } for loc in locations])

@app.route('/api/equipments', methods=['GET'])
def get_equipments():
    env_id = request.args.get('environment_id')
    query = Equipment.query
    if env_id:
        query = query.filter_by(environment_id=env_id)
    
    equipments = query.all()
    result = []
    for eq in equipments:
        eq_dict = eq.to_dict()
        eq_dict['next_maintenance_date'] = get_next_actual_maintenance(eq).isoformat()
        result.append(eq_dict)
    return jsonify(result)

@app.route('/api/equipments', methods=['POST'])
def add_equipment():
    data = request.json
    try:
        commissioning_date = datetime.strptime(data['commissioning_date'], '%Y-%m-%d').date()
        
        last_m_dt = commissioning_date
        if commissioning_date == date.today() and data['freq_type'] == 'Daily':
            last_m_dt = commissioning_date - relativedelta(days=1)
            
        new_eq = Equipment(
            name=data['name'],
            description=data.get('description', ''),
            environment_id=data['environment_id'],
            commissioning_date=commissioning_date,
            freq_type=data['freq_type'],
            freq_days=int(data.get('freq_days', 0)),
            freq_months=int(data.get('freq_months', 0)),
            freq_years=int(data.get('freq_years', 0)),
            last_maintenance_date=last_m_dt,
            serial_number=data.get('serial_number'),
            location=data.get('location')
        )
        db.session.add(new_eq)
        db.session.commit()
        return jsonify(new_eq.to_dict()), 201
    except Exception as e:
        print(e)
        return jsonify({'error': str(e)}), 400

@app.route('/api/equipments/<int:id>', methods=['PUT'])
def update_equipment(id):
    eq = Equipment.query.get_or_404(id)
    data = request.json
    try:
        if 'name' in data: eq.name = data['name']
        if 'description' in data: eq.description = data['description']
        if 'environment_id' in data: eq.environment_id = data['environment_id']
        if 'commissioning_date' in data: 
            eq.commissioning_date = datetime.strptime(data['commissioning_date'], '%Y-%m-%d').date()
        if 'freq_type' in data: eq.freq_type = data['freq_type']
        if 'freq_days' in data: eq.freq_days = int(data.get('freq_days', 0))
        if 'freq_months' in data: eq.freq_months = int(data.get('freq_months', 0))
        if 'freq_years' in data: eq.freq_years = int(data.get('freq_years', 0))
        if 'serial_number' in data: eq.serial_number = data.get('serial_number')
        if 'location' in data: eq.location = data.get('location')
        
        db.session.commit()
        return jsonify(eq.to_dict()), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/equipments/<int:id>', methods=['DELETE'])
def delete_equipment(id):
    eq = Equipment.query.get_or_404(id)
    # delete associated history and overrides
    MaintenanceHistory.query.filter_by(equipment_id=eq.id).delete()
    MaintenanceOverride.query.filter_by(equipment_id=eq.id).delete()
    db.session.delete(eq)
    db.session.commit()
    return jsonify({'message': 'Deleted successfully'}), 200

@app.route('/api/equipments/<int:id>/standby', methods=['PATCH'])
def toggle_standby(id):
    eq = Equipment.query.get_or_404(id)
    data = request.json
    standby_val = data.get('standby', False)
    
    if standby_val:
        eq.standby = 1
        eq.standby_since = datetime.utcnow()
    else:
        eq.standby = 0
        eq.standby_since = None
        eq.last_maintenance_date = date.today()
        # clear any existing overrides as we are recalculating
        MaintenanceOverride.query.filter_by(equipment_id=eq.id).delete()
        
    db.session.commit()
    eq_dict = eq.to_dict()
    eq_dict['next_maintenance_date'] = get_next_actual_maintenance(eq).isoformat()
    return jsonify(eq_dict), 200

@app.route('/api/equipments/<int:id>/maintenance', methods=['POST'])
def complete_maintenance(id):
    eq = Equipment.query.get_or_404(id)
    
    if request.content_type and request.content_type.startswith('multipart/form-data'):
        data = request.form
        files = request.files.getlist('documents')
    else:
        data = request.json
        files = []
    
    if data and data.get('completion_date'):
        completion_date = datetime.strptime(data['completion_date'], '%Y-%m-%d').date()
    else:
        completion_date = date.today()

    person = data.get('person') if data else None
    description = data.get('description') if data else None
    
    document_paths = []
    for file in files:
        if file and file.filename != '':
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], f"{id}_{int(datetime.now().timestamp())}_{filename}")
            file.save(filepath)
            document_paths.append(filepath)
            
    document_path_str = ",".join(document_paths) if document_paths else None
        
    history = MaintenanceHistory(
        equipment_id=eq.id,
        completion_date=completion_date,
        person=person,
        description=description,
        document_path=document_path_str
    )
    db.session.add(history)

    # Calculate what the scheduled date was (theory)
    theoretical_date = calculate_next_maintenance(
        eq.last_maintenance_date, 
        eq.freq_type, 
        eq.freq_days, 
        eq.freq_months, 
        eq.freq_years
    )
    
    actual_scheduled_date = get_next_actual_maintenance(eq)
    
    # If the task is overdue (completed after the actual scheduled date),
    # then reset the cycle starting from the completion date.
    # Otherwise, keep the cycle based on the original theoretical date.
    if completion_date > actual_scheduled_date:
        # Overdue: calculate from completion date
        eq.last_maintenance_date = completion_date
    else:
        eq.last_maintenance_date = theoretical_date
        
    MaintenanceOverride.query.filter_by(equipment_id=eq.id, original_date=theoretical_date).delete()
    
    db.session.commit()
    
    eq_dict = eq.to_dict()
    eq_dict['next_maintenance_date'] = get_next_actual_maintenance(eq).isoformat()
    return jsonify(eq_dict), 200

@app.route('/api/logs', methods=['GET'])
def get_all_logs():
    env_id = request.args.get('environment_id')
    from_date_str = request.args.get('from_date')
    to_date_str = request.args.get('to_date')
    
    query = MaintenanceHistory.query.join(Equipment, MaintenanceHistory.equipment_id == Equipment.id)
    
    if env_id and env_id != 'all' and env_id != '':
        query = query.filter(Equipment.environment_id == env_id)
        
    if from_date_str:
        query = query.filter(MaintenanceHistory.completion_date >= datetime.strptime(from_date_str, '%Y-%m-%d').date())
    if to_date_str:
        query = query.filter(MaintenanceHistory.completion_date <= datetime.strptime(to_date_str, '%Y-%m-%d').date())
        
    logs = query.order_by(MaintenanceHistory.completion_date.desc()).all()
    result = []
    for log in logs:
        docs = log.document_path.split(',') if log.document_path else []
        result.append({
            'id': log.id,
            'equipment_id': log.equipment.id,
            'equipment_name': log.equipment.name,
            'environment_name': log.equipment.environment.name if log.equipment.environment else None,
            'location': log.equipment.location,
            'completion_date': log.completion_date.isoformat(),
            'person': log.person,
            'description': log.description,
            'document_paths': docs
        })
    return jsonify(result)

@app.route('/api/calendar-events', methods=['GET'])
def get_calendar_events():
    env_id = request.args.get('environment_id')
    month = request.args.get('month')
    year = request.args.get('year')
    
    if not month or not year:
        return jsonify({'error': 'Missing parameters'}), 400
        
    try:
        month = int(month)
        year = int(year)
    except:
        return jsonify({'error': 'Invalid month or year'}), 400
        
    query = Equipment.query
    if env_id and env_id != 'all':
        query = query.filter_by(environment_id=env_id)
    equipments = query.all()
    
    from datetime import date
    from dateutil.relativedelta import relativedelta
    results = []
    
    for eq in equipments:
        if eq.standby == 1:
            continue

        actual_date = get_next_actual_maintenance(eq)

        if actual_date.month == month and actual_date.year == year:
            today = date.today()
            if actual_date < today:
                status = 'overdue'
            elif (actual_date - today).days <= 7:
                status = 'due_soon'
            else:
                status = 'upcoming'

            results.append({
                'equipment_id': eq.id,
                'equipment_name': eq.name,
                'due_date': actual_date.isoformat(),
                'status': status,
                'environment_name': eq.environment.name if eq.environment else None,
                'location': eq.location
            })
    return jsonify(results)

@app.route('/api/equipments/<int:id>/calendar', methods=['GET'])
def get_equipment_calendar(id):
    eq = Equipment.query.get_or_404(id)
    overrides = MaintenanceOverride.query.filter_by(equipment_id=eq.id).all()
    override_dict = {o.original_date: o.new_date for o in overrides}
    
    from datetime import date
    from dateutil.relativedelta import relativedelta
    dates = []
    current_theoretical = eq.last_maintenance_date
    limit_date = date.today() + relativedelta(years=10)
    iters = 0
    while current_theoretical <= limit_date and iters < 3650:
        iters += 1
        current_theoretical = calculate_next_maintenance(
            current_theoretical, eq.freq_type, eq.freq_days, eq.freq_months, eq.freq_years
        )
        # Prevent infinite loop if frequency is 0
        if current_theoretical == eq.last_maintenance_date:
            break
            
        actual_date = override_dict.get(current_theoretical, current_theoretical)
        dates.append({
            'original_date': current_theoretical.isoformat(),
            'actual_date': actual_date.isoformat(),
            'is_overridden': current_theoretical in override_dict
        })
        
    return jsonify(dates)

@app.route('/api/equipments/<int:id>/calendar/override', methods=['POST'])
def set_calendar_override(id):
    eq = Equipment.query.get_or_404(id)
    data = request.json
    original_date = datetime.strptime(data['original_date'], '%Y-%m-%d').date()
    new_date = datetime.strptime(data['new_date'], '%Y-%m-%d').date()
    
    override = MaintenanceOverride.query.filter_by(equipment_id=eq.id, original_date=original_date).first()
    if override:
        if original_date == new_date:
            db.session.delete(override)
        else:
            override.new_date = new_date
    else:
        if original_date != new_date:
            new_override = MaintenanceOverride(
                equipment_id=eq.id,
                original_date=original_date,
                new_date=new_date
            )
            db.session.add(new_override)
            
    db.session.commit()
    return jsonify({'message': 'Override saved successfully'})

@app.route('/api/synthesis', methods=['GET'])
def get_synthesis():
    month_arg = request.args.get('month')
    year_arg = request.args.get('year')
    env_id = request.args.get('environment_id')
    today_arg = request.args.get('today') == 'true'
    overdue_arg = request.args.get('overdue') == 'true'
    target_month = int(month_arg) if month_arg and month_arg != 'all' else None
    target_year = int(year_arg) if year_arg and year_arg != 'all' else None
    query = Equipment.query
    if env_id and env_id != 'all' and env_id != '':
        query = query.filter_by(environment_id=env_id)
    equipments = query.all()
    from datetime import date
    from dateutil.relativedelta import relativedelta
    results = []
    
    for eq in equipments:
        overrides = MaintenanceOverride.query.filter_by(equipment_id=eq.id).all()
        override_dict = {o.original_date: o.new_date for o in overrides}
        
        limit_date = date.today() + relativedelta(years=2)
        if target_year is not None:
             limit_date = date(target_year, 12, 31)
             
        current_theoretical = eq.last_maintenance_date
        
        iters = 0
        while current_theoretical <= limit_date and iters < 2000:
            iters += 1
            current_theoretical = calculate_next_maintenance(
                current_theoretical, eq.freq_type, eq.freq_days, eq.freq_months, eq.freq_years
            )
            if current_theoretical == eq.last_maintenance_date:
                break
                
            actual_date = override_dict.get(current_theoretical, current_theoretical)
            is_overdue = actual_date < date.today()
            
            if overdue_arg:
                matches_next = is_overdue
            elif today_arg:
                matches_next = (actual_date == date.today())
            else:
                matches_next = True
                if target_month is not None and actual_date.month != target_month:
                    matches_next = False
                if target_year is not None and actual_date.year != target_year:
                    matches_next = False
            
            if matches_next:
                status = 'overdue' if is_overdue else 'pending'
                eq_dict = eq.to_dict()
                eq_dict['next_maintenance_date'] = actual_date.isoformat()
                eq_dict['status'] = status
                eq_dict['task_id'] = f"{eq.id}_{actual_date.isoformat()}"
                results.append(eq_dict)
                
                # If they want 'all' unfiltered, just return the next 1 to avoid enormous lists
                if target_month is None and target_year is None and not overdue_arg and not today_arg:
                    break
    return jsonify(results)

@app.route('/api/maintenance/logs', methods=['GET'])
def get_maintenance_logs():
    env_id = request.args.get('environment_id')
    query = MaintenanceHistory.query.join(Equipment, MaintenanceHistory.equipment_id == Equipment.id)
    if env_id:
        query = query.filter(Equipment.environment_id == env_id)
        
    logs = query.order_by(MaintenanceHistory.completion_date.desc()).all()
    result = []
    for log in logs:
        docs = log.document_path.split(',') if log.document_path else []
        result.append({
            'id': log.id,
            'equipment_id': log.equipment.id,
            'equipment_name': log.equipment.name,
            'completion_date': log.completion_date.isoformat(),
            'person': log.person,
            'description': log.description,
            'document_paths': docs
        })
    return jsonify(result)

@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

SYSTEM_PROMPT = """You are an AVL equipment classifier. Classify equipment into exactly one of these three environments based on its name and description.

1. Test Bed: Controlled environment where engines, motors, or powertrain components are tested in isolation (not inside a vehicle). Dedicated to a single engine test cell.
Keywords: test bed, test cell, engine, powertrain, transmission, dynamometer, actuator, throttle, blow-by, lambda, combustion, torque, e-motor, HV, cell-specific.

2. Chassis Dyno: Tests a complete vehicle on rollers (rollers sets, locking devices, pneumatic cabinets, roller motors).
Keywords: chassis, roller, dyno, ROADSIM, VECON, restraint, centering, locking, traversing, load cell, encoder, vehicle testing, road simulation, roller covering, 2WD, 4WD.

3. Common Facilities: Shared building/utility infrastructure serving multiple cells or the whole building (central cooling, shared pumps, compressed air, facility power, whole-building HVAC, fuel supply).
Keywords: common, shared, central, facility, building, utility, supply, distribution, multi-cell, HVAC, compressed air, chilled water, demineralised, fuel supply, wastewater.

RULES:
1. Reply ONLY with valid JSON. NO markdown, NO notes, NO conversational text outside the braces.
2. Format: {"environment": "Test Bed", "confidence": 0.95, "reason": "Short 3 to 5 words max."}
3. environment must be exactly: Test Bed, Chassis Dyno, or Common Facilities
4. If name is too vague, set confidence below 0.65 to flag for human review."""

# ─────────────────────────────────────────────────────────────────────────────
# MAINTENANCE PERIOD DETECTION & NORMALIZATION
# ─────────────────────────────────────────────────────────────────────────────

# Each entry: (compiled_regex, (freq_type, freq_days, freq_months, freq_years, label))
# IMPORTANT: N-unit patterns (e.g. "9 monthly", "3 monthly") must come BEFORE the plain
# unit patterns so they match first.
PERIOD_REGEX_MAP = [
    # ── N-unit compound forms: "9 monthly", "3-monthly", "9 month", "every 9 months" ──
    (re.compile(r'(?<![\w])(\d+)\s*[\-]?\s*(month(?:ly)?|week(?:ly)?|day(?:s)?|year(?:ly)?)(?:[\s,]|$)', re.I),
     None),   # sentinel — handled dynamically in the functions below
    # ── Specific named intervals ──
    (re.compile(r'\b(quarterly|3[\s\-]+month(?:ly)?|every\s+3\s+months?)\b', re.I),
     ('Custom', 0, 3, 0, '3-Monthly')),
    (re.compile(r'\b(half[\s\-]+year(?:ly)?|6[\s\-]+month(?:ly)?|semi[\s\-]+annual|bi[\s\-]+annual|every\s+6\s+months?)\b', re.I),
     ('Custom', 0, 6, 0, 'Half-Yearly')),
    (re.compile(r'\b(annual(?:ly)?|year(?:ly)?|once\s+a\s+year|per\s+year|p\.a\.|p/a)\b', re.I),
     ('Yearly', 0, 0, 0, 'Annual')),
    (re.compile(r'\bdaily\b|\bevery\s+day\b', re.I),
     ('Daily',  0, 0, 0, 'Daily')),
    (re.compile(r'\bweekly\b|\bevery\s+week\b', re.I),
     ('Weekly', 0, 0, 0, 'Weekly')),
    (re.compile(r'\bmonthly\b|\bevery\s+month\b', re.I),
     ('Monthly', 0, 0, 0, 'Monthly')),
]

def _parse_n_unit(text: str):
    """Try to parse 'N monthly/weekly/daily/yearly' or 'N months/weeks/days/years'.
    Returns (freq_type, freq_days, freq_months, freq_years, label) or None.
    Uses (?<![\\w.]) to prevent matching section numbers like '5.2.2 Monthly'."""
    m = re.search(
        r'(?<![\w.])(\d+)\s*[\-]?\s*(month(?:ly)?|week(?:ly)?|day(?:s)?|year(?:ly)?)',
        text, re.I
    )
    if not m:
        return None
    n = int(m.group(1))
    unit = m.group(2).lower()
    if unit.startswith('month'):
        if n == 1: return ('Monthly', 0, 1, 0, '1 Month')
        if n == 6: return ('Custom', 0, 6, 0, '6 Months')
        if n == 12: return ('Yearly', 0, 0, 1, '12 Months')
        return ('Custom', 0, n, 0, f'{n} Months')
    elif unit.startswith('week'):
        if n == 1: return ('Weekly', 0, 0, 0, '1 Week')
        return ('Custom', n * 7, 0, 0, f'{n} Weeks')
    elif unit.startswith('day'):
        if n == 1: return ('Daily', 1, 0, 0, '1 Day')
        return ('Custom', n, 0, 0, f'{n} Days')
    elif unit.startswith('year'):
        if n == 1: return ('Yearly', 0, 0, 1, '1 Year')
        return ('Custom', 0, 0, n, f'{n} Years')
    return None

def _is_standalone_period(cell_text: str) -> bool:
    """Return True only if the cell looks like a DEDICATED interval cell, not a description
    that incidentally mentions a period (e.g. 'checked once a year by an approved company').
    Rules:
      - Cell must be <= 50 chars (dedicated interval cells are short labels).
      - detect_period_in_text must return a result.
      - The period keyword must occupy >= 40% of the cell length (it IS the cell, not embedded).
    """
    text = cell_text.strip()
    if not text or len(text) > 50:
        return False
    p = detect_period_in_text(text)
    if not p:
        return False
    # Check the period token ratio: find the matched span length
    m = re.search(
        r'(?<![\w.])(\d+\s*[\-]?\s*)?(month(?:ly)?|week(?:ly)?|day(?:s)?|year(?:ly)?|'
        r'daily|weekly|monthly|quarterly|annual(?:ly)?|half[\s\-]+year(?:ly)?|bi[\-\s]?annual)',
        text, re.I
    )
    if m and len(m.group(0)) / len(text) >= 0.35:
        return True
    return False


# N-unit pattern used for position-finding (mirrors _parse_n_unit regex)
_N_UNIT_PAT = re.compile(
    r'(?<![\w.])(\d+)\s*[-]?\s*(month(?:ly)?|week(?:ly)?|day(?:s)?|year(?:ly)?)',
    re.I
)

def _find_earliest_period(text: str):
    """Scan all period patterns and return the result whose keyword appears EARLIEST
    in the text. This prevents a later incidental mention (e.g. 'once a year' in a
    description) from overriding an earlier heading-level keyword (e.g. 'Daily').

    Returns (freq_type, freq_days, freq_months, freq_years, label) or None.
    """
    if not text:
        return None

    INF = len(text) + 1
    best_pos, best_result = INF, None

    # N-unit patterns: "9 monthly", "3 months", etc.
    m = _N_UNIT_PAT.search(text)
    if m:
        r = _parse_n_unit(text)
        if r:
            best_pos, best_result = m.start(), r

    # Named patterns — find the one with the earliest match START position
    for pattern, result in PERIOD_REGEX_MAP:
        if result is None:      # sentinel (N-unit handled above)
            continue
        m = pattern.search(text)
        if m and m.start() < best_pos:
            best_pos, best_result = m.start(), result

    return best_result

def normalize_frequency(text: str):
    """Map a free-text maintenance period to (freq_type, freq_days, freq_months, freq_years, label)."""
    if not text:
        return ('Yearly', 0, 0, 0, 'Annual')
    result = _find_earliest_period(text)
    return result or ('Yearly', 0, 0, 0, str(text).strip() or 'Annual')

def detect_period_in_text(text: str):
    """Return period tuple if a period keyword is found in text, else None.
    Returns the period whose keyword appears EARLIEST in the text (not pattern priority).
    """
    return _find_earliest_period(text)


# ─────────────────────────────────────────────────────────────────────────────
# TABLE-EXTRACTED NAME QUALITY SCORING
# ─────────────────────────────────────────────────────────────────────────────

def _score_extracted_name(name: str, description: str = '') -> float:
    """Score how likely a parsed name is a real equipment/system (0.0–0.95).
    Table-extracted items that look like real equipment get 0.95.
    Items that look like metadata, pinout tables, safety circuit diagrams,
    connector assignments, or non-equipment text get lower scores.
    """
    if not name:
        return 0.10

    n = name.strip()
    n_lower = n.lower()
    d_lower = (description or '').strip().lower()

    # ── Helper: does name contain real equipment keywords? ──
    _equipment_kws = {
        'motor', 'pump', 'valve', 'sensor', 'actuator', 'drive', 'filter',
        'cooler', 'heater', 'compressor', 'fan', 'blower', 'generator',
        'transformer', 'switch', 'breaker', 'controller', 'system', 'unit',
        'module', 'panel', 'station', 'dynamo', 'roller', 'dyno', 'inverter',
        'conveyor', 'chiller', 'boiler', 'turbine', 'cylinder', 'bearing',
        'coupling', 'encoder', 'transducer', 'instrument', 'gauge', 'meter',
        'regulator', 'damper', 'absorber', 'exhaust', 'intake', 'throttle',
        'battery', 'charger', 'rectifier', 'supply', 'conditioner',
    }
    has_equipment_word = any(kw in n_lower for kw in _equipment_kws)

    # ══════════════════════════════════════════════════════════════════════
    # TIER 1 — Exact matches & unmistakable garbage (confidence 0.10–0.20)
    # ══════════════════════════════════════════════════════════════════════

    # ── Known non-equipment terms ──
    non_equipment = {
        'ascii', 'n/a', 'na', 'not applicable', 'none', 'type',
        'type designation', 'yes', 'no', 'applicable', 'description',
        'name', 'item', 'notes', 'remarks', 'total', 'sum', 'page',
        'date', 'category', 'status', 'result', 'value', 'unit',
        'qty', 'quantity', 'serial number', 'serial no', 'reference',
        'see above', 'see below', 'performance level',
        'mean time to dangerous failure', 'average diagnostic coverage',
        'diagnostic coverage', 'safety function', 'safety level',
    }
    if n_lower in non_equipment:
        return 0.20

    # ── Short safety / electrical terms that are never equipment ──
    short_junk = {
        'pl a', 'pl b', 'pl c', 'pl d', 'pl e',
        'sil 1', 'sil 2', 'sil 3', 'sil 4',
        'gnd', 'vdc', 'nc', 'no', 'shield', 'shld', 'common',
        'recessive', 'dominant',
    }
    if n_lower in short_junk:
        return 0.15

    # ── Category concatenation patterns (e.g. "Cat. B Cat. 1 Cat. 2 ...") ──
    if re.search(r'(?:cat\.?\s*\w+[\s,]*){3,}', n_lower):
        return 0.15

    # ── Connector pinout tables (e.g. "D-Sub Buchse - 1", "D-Sub Buchse - Cover") ──
    if re.search(r'd[\-\s]*sub\b', n_lower):
        return 0.15

    # ── Repeated pin patterns (e.g. "Pin 9 Pin 6 Pin 6 Pin 9 - 1") ──
    if re.search(r'(?:pin\s*\d+\s*){2,}', n_lower):
        return 0.15

    # ══════════════════════════════════════════════════════════════════════
    # TIER 2 — Strong indicators of non-equipment (confidence 0.20–0.30)
    # ══════════════════════════════════════════════════════════════════════

    # ── Safety circuit example entries (e.g. "Example 1: Category 1 PL c - X105 ...") ──
    if re.search(r'^example\s*\d', n_lower):
        return 0.20

    # ── Quadrant mode descriptions (e.g. "Quadrant 1- - Single safety loop") ──
    if re.search(r'quadrant\s*\d', n_lower):
        return 0.20

    # ── Connector designator + signal (e.g. "X105 (INTERLOCK) + 24V ...", "X112 (ISR) + 24V GND") ──
    if re.search(r'^x\d+\s*\(', n_lower):
        return 0.20

    # ── Name is primarily a signal/wiring reference ──
    # Contains electrical signal patterns without any equipment keywords
    if not has_equipment_word and re.search(
        r'\b(?:interlock|24v|gnd|vdc|relay\d*|can\s*[lhv]|shld|'
        r'rs[\-\s]*(?:232|422|485)|common)\b', n_lower
    ):
        return 0.25

    # ── Description is a known electrical / signal value (pinout table) ──
    signal_descriptions = {
        'gnd', 'nc', 'no', '+24vdc', '+24v', '-24v', '-', '--', '---',
        '—', '–', 'shield', 'shld', 'common', 'can l', 'can h',
        'can gnd', 'can v+', 'can shld', 'relay11', 'relay21',
        'recessive', 'dominant', '+24v interlock_in_+',
    }
    if d_lower in signal_descriptions:
        return 0.20

    # ── Description matches a signal/pin value pattern ──
    if d_lower and re.search(
        r'^(?:[+-]?\d+v(?:dc)?|relay\d+|can\s+\w+|rs[\-]?\d+)$', d_lower
    ):
        return 0.20

    # ── Description is a cross-reference (e.g. "See chapter 3.1, on page 10.") ──
    if re.search(r'see\s+(?:chapter|page|section|figure|table)\b', d_lower):
        return 0.25

    # ══════════════════════════════════════════════════════════════════════
    # TIER 3 — Moderate suspicion (confidence 0.25–0.40)
    # ══════════════════════════════════════════════════════════════════════

    # ── Description hints at metadata (e.g. "applicable", "not applicable") ──
    metadata_descriptions = {'applicable', 'not applicable', 'n/a', 'yes', 'no', 'none'}
    if d_lower in metadata_descriptions and len(n) <= 10:
        return 0.25

    # ── Contains metadata-like phrases as substrings ──
    if re.search(r'\b(?:mttf|dc\s+avg|performance\s+level|diagnostic\s+coverage)\b', n_lower):
        return 0.25

    # ── Name has "Emergency/Power/Voltage" but is clearly a wiring entry ──
    if not has_equipment_word and re.search(
        r'(?:emergency|power|voltage)\s*-\s*x\d+', n_lower
    ):
        return 0.25

    # ── Too short (≤ 2 chars) — likely a code or cell artifact ──
    if len(n) <= 2:
        return 0.30

    # ── Too long (> 120 chars) — likely concatenated cell content ──
    if len(n) > 120:
        return 0.35

    # ── Mostly non-alphabetic (numbers, symbols, punctuation) ──
    alpha_ratio = sum(1 for c in n if c.isalpha()) / max(len(n), 1)
    if alpha_ratio < 0.30:
        return 0.30

    # ── Name looks like a wiring label: "Something - X\d+ (...) + \d+V ..." ──
    if not has_equipment_word and re.search(r'x\d+\s*\(.*\)\s*\+?\s*\d+v', n_lower):
        return 0.25

    # ══════════════════════════════════════════════════════════════════════
    # PASSED — Genuine equipment name
    # ══════════════════════════════════════════════════════════════════════
    return 0.95

# ─────────────────────────────────────────────────────────────────────────────
# AI PROMPTS — DOCUMENT-LEVEL CONTEXT & SCHEDULE EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

DOCUMENT_CONTEXT_PROMPT = """You are analyzing a maintenance manual or technical document.
From the text provided, determine:
1. What environment/facility type this document primarily describes:
   - "Test Bed": engine or powertrain test cells, engine dynamometers, combustion or powertrain testing in isolation
   - "Chassis Dyno": full vehicle on rollers, chassis dynamometer, road simulation, roller sets, vehicle testing
   - "Common Facilities": shared building utilities, central cooling, compressed air, HVAC, multi-cell infrastructure
2. Your confidence (0.0 to 1.0) — be high only if the document clearly identifies the facility type
3. A short reason (max 10 words)

Reply ONLY with valid JSON, no markdown or extra text:
{"environment": "Chassis Dyno", "confidence": 0.95, "reason": "Document describes chassis dynamometer system"}"""

SCHEDULE_EXTRACTION_PROMPT = """You are extracting maintenance schedule information from a technical document.
Extract ALL maintainable systems or components mentioned, with their maintenance frequency.

For each system, return:
- name: the system or component name
- description: brief description if available, else empty string
- freq_label: the maintenance period as found in the text (Daily, Weekly, Monthly, 3-Monthly, Half-Yearly, Annual)
- freq_type: one of exactly: Daily, Weekly, Monthly, Custom, Yearly
- freq_days: days for Custom (0 otherwise)
- freq_months: months for Custom (0 otherwise)
- freq_years: years for Custom (0 otherwise)

If a system has multiple maintenance intervals, include it once per interval.
Ignore generic items with no specific system name.

Reply ONLY with a valid JSON array, no markdown:
[{"name":"...","description":"...","freq_label":"...","freq_type":"...","freq_days":0,"freq_months":0,"freq_years":0}]"""

def extract_document_context(text: str) -> dict:
    """Call AI once for the full document to identify its environment/facility type."""
    snippet = text[:8000]
    try:
        payload = {
            "model": AI_MODEL,
            "messages": [
                {"role": "system", "content": DOCUMENT_CONTEXT_PROMPT},
                {"role": "user", "content": f"Document text (first section):\n{snippet}"}
            ],
            "temperature": 0.0,
            "max_tokens": 200
        }
        hdrs = {"Content-Type": "application/json", "Authorization": f"Bearer {AI_API_KEY}"}
        resp = requests.post(
            f"{AI_API_BASE.rstrip('/')}/v1/chat/completions",
            json=payload, headers=hdrs, timeout=30
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"].strip()
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if m:
            result = json.loads(m.group(0))
            valid_envs = ["Test Bed", "Chassis Dyno", "Common Facilities"]
            if result.get("environment") not in valid_envs:
                result["environment"] = "Common Facilities"
                result["confidence"] = 0.0
            result["confidence"] = round(float(result.get("confidence", 0.0)), 2)
            print(f"[DocContext] {result}")
            return result
    except Exception as exc:
        print(f"[DocContext] Failed: {exc}")
    return {"environment": "Common Facilities", "confidence": 0.0, "reason": "Could not determine from document"}

def extract_systems_from_text_ai(text: str) -> list:
    """AI fallback: ask the model to extract systems and maintenance periods from raw text."""
    snippet = text[:12000]
    try:
        payload = {
            "model": AI_MODEL,
            "messages": [
                {"role": "system", "content": SCHEDULE_EXTRACTION_PROMPT},
                {"role": "user", "content": f"Document text:\n{snippet}"}
            ],
            "temperature": 0.0,
            "max_tokens": 2000
        }
        hdrs = {"Content-Type": "application/json", "Authorization": f"Bearer {AI_API_KEY}"}
        resp = requests.post(
            f"{AI_API_BASE.rstrip('/')}/v1/chat/completions",
            json=payload, headers=hdrs, timeout=60
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"].strip()
        m = re.search(r'\[.*\]', raw, re.DOTALL)
        if m:
            items = json.loads(m.group(0))
            result = []
            for s in items:
                if not s.get('name'):
                    continue
                ft = s.get('freq_type', 'Yearly')
                if ft not in ['Daily', 'Weekly', 'Monthly', 'Custom', 'Yearly']:
                    ft = 'Yearly'
                result.append({
                    'name': str(s['name']).strip(),
                    'description': str(s.get('description', '')).strip(),
                    'freq_type': ft,
                    'freq_days': int(s.get('freq_days', 0) or 0),
                    'freq_months': int(s.get('freq_months', 0) or 0),
                    'freq_years': int(s.get('freq_years', 0) or 0),
                    'freq_label': s.get('freq_label', ft),
                    'commissioning_date': None,
                    'source': 'ai_text_extraction'
                })
            return result
    except Exception as exc:
        print(f"[TextAI] Failed: {exc}")
    return []

def _parse_tabular_records(records: list) -> list:
    """Parse CSV/Excel rows into structured system dicts using fuzzy header matching."""

    def find_val(row, keywords):
        for key, val in row.items():
            if not isinstance(key, str):
                continue
            k = key.lower().strip()
            for kw in keywords:
                if kw in k:
                    return val
        return None

    extracted = []
    for s in records:
        name = find_val(s, ['system name', 'equipment name', 'system', 'equipment', 'name', 'item', 'asset'])
        if name is None:
            continue
        name_str = str(name).strip()
        if not name_str or name_str.lower() in ['nan', 'none', '']:
            continue

        desc = find_val(s, ['description', 'details', 'notes', 'spec', 'info'])
        freq_raw = find_val(s, ['frequency', 'interval', 'cycle', 'maintenance', 'period', 'schedule'])
        comm = find_val(s, ['commissioning', 'comm date', 'commission', 'date', 'installed'])

        freq_str = str(freq_raw).strip() if (freq_raw is not None and not (isinstance(freq_raw, float) and pd.isna(freq_raw))) else ''
        ft, fd, fm, fy, fl = normalize_frequency(freq_str)
        desc_str = str(desc).strip() if (desc is not None and not (isinstance(desc, float) and pd.isna(desc))) else ''

        extracted.append({
            'name': name_str,
            'description': desc_str,
            'freq_type': ft,
            'freq_days': fd,
            'freq_months': fm,
            'freq_years': fy,
            'freq_label': fl,
            'commissioning_date': str(comm).strip() if (comm is not None and not (isinstance(comm, float) and pd.isna(comm))) else None,
            'source': 'tabular',
            'confidence': _score_extracted_name(name_str, desc_str)
        })
    return extracted

# ─────────────────────────────────────────────────────────────────────────────
# PDF SCHEDULE EXTRACTION  (fitz for page text + pdfplumber for tables)
# ─────────────────────────────────────────────────────────────────────────────

def _table_rows_normalize(raw_table):
    """Convert a pdfplumber raw table to list[list[str]], dropping all-empty rows."""
    rows = []
    for row in raw_table:
        cells = [str(c).strip() if c is not None else '' for c in row]
        if any(cells):
            rows.append(cells)
    return rows

def _is_marked(cell: str) -> bool:
    """Return True if the cell value indicates a maintenance task is required at this interval."""
    if not cell:
        return False
    c = cell.strip()
    return c not in ('', '-', '–', '—', 'no', 'n/a', 'none', 'nan')

def extract_schedule_from_pdf(file_bytes: bytes):
    """
    Extract maintenance systems from a PDF.
    Returns (systems: list[dict], full_text: str).
    """
    full_text = ""
    page_texts = []

    # ── Phase 1: full-text extraction with fitz ──────────────────────
    try:
        fitz_doc = fitz.open(stream=file_bytes, filetype="pdf")
        for pg in fitz_doc:
            t = pg.get_text()
            page_texts.append(t)
            full_text += t + "\n"
        fitz_doc.close()
    except Exception as exc:
        print(f"[fitz] Text extraction failed: {exc}")

    # ── Phase 2: table extraction with pdfplumber ────────────────────
    extracted = []
    last_seen_period = None
    last_seen_name_col = 0
    last_seen_name_col_explicit = False
    
    header_kws = ('name', 'system', 'component', 'equipment', 'item', 'activity', 'task', 'check', 'action', 'description')
    condition_kws = {'low', 'medium', 'heavy', 'high', 'normal', 'severe', 'light'}

    def resolve_system_name(raw_name, parent_system, is_explicit_col):
        """Intelligently combine parent headings with row names to fix 'Scenario 2' edge cases."""
        if not parent_system:
            return raw_name
            
        # If it's a generic condition state, always prepend parent
        if raw_name.lower() in condition_kws:
            return f"{parent_system} - {raw_name}"
            
        # If the table column lacked a proper header like 'Description' or 'Name'
        if not is_explicit_col:
            if parent_system.lower() not in raw_name.lower():
                return f"{parent_system} - {raw_name}"
                
        # For Scenario 1: Leave it exactly as it is
        return raw_name

    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for pg_idx, pg in enumerate(pdf.pages):
                pg_text = page_texts[pg_idx] if pg_idx < len(page_texts) else ""
                
                # Use find_tables() to retain bounding box (bbox) coordinates
                tables = pg.find_tables()
                if not tables:
                    continue

                for table_obj in tables:
                    raw_table = table_obj.extract()
                    if not raw_table or len(raw_table) < 2:
                        continue

                    rows = _table_rows_normalize(raw_table)
                    if len(rows) < 2:
                        continue

                    headers = rows[0]

                    # ── Context Extraction: Find the closest heading above the table ──
                    table_top = table_obj.bbox[1]
                    crop_box = (0, 0, pg.width, max(0, table_top - 2))
                    parent_system = None
                    try:
                        text_above = pg.within_bbox(crop_box).extract_text()
                        if text_above:
                            lines = [l.strip() for l in text_above.split('\n') if l.strip()]
                            for line in reversed(lines):
                                if len(line) > 80: continue # Skip standard paragraphs
                                
                                # Match numbered headings like "8.3.1. Air filter mats"
                                m = re.match(r'^(\d+\.)+\d*\s*(.*)', line)
                                if m and m.group(2):
                                    parent_system = re.sub(r'\(.*?\)', '', m.group(2)).strip()
                                    break
                                    
                                # Fallback: Short title case line that isn't a period descriptor
                                if 3 <= len(line) <= 60 and line.istitle() and not detect_period_in_text(line):
                                    parent_system = line
                                    break
                    except ValueError:
                        pass # Fails if crop box is invalid, which is fine to ignore

                    # ── Try Layout A: period keywords in column headers ──
                    period_cols = {} 
                    for ci, h in enumerate(headers):
                        p = detect_period_in_text(h)
                        if p:
                            period_cols[ci] = p

                    if period_cols:
                        # Identify name column by explicit keywords
                        name_col_explicit = False
                        name_col = 0
                        for ci, h in enumerate(headers):
                            if ci not in period_cols and any(kw in h.lower() for kw in header_kws):
                                name_col = ci
                                name_col_explicit = True
                                break
                                
                        if not name_col_explicit:
                            name_col = next((ci for ci in range(len(headers)) if ci not in period_cols), 0)
                            
                        desc_col = next(
                            (ci for ci in range(len(headers))
                             if ci != name_col and ci not in period_cols),
                            None
                        )

                        last_seen_period = None

                        for row in rows[1:]:
                            raw_name = row[name_col] if name_col < len(row) else ''
                            if not raw_name or raw_name.lower() in ('', 'none', 'nan'):
                                continue
                                
                            desc = row[desc_col] if (desc_col and desc_col < len(row)) else ''
                            final_name = resolve_system_name(raw_name, parent_system, name_col_explicit)

                            added = False
                            for ci, period_tuple in period_cols.items():
                                if ci < len(row) and _is_marked(row[ci]):
                                    ft, fd, fm, fy, fl = period_tuple
                                    extracted.append({
                                        'name': final_name,
                                        'description': desc,
                                        'freq_type': ft,
                                        'freq_days': fd,
                                        'freq_months': fm,
                                        'freq_years': fy,
                                        'freq_label': fl,
                                        'commissioning_date': None,
                                        'source': 'pdf_layout_a',
                                        'confidence': _score_extracted_name(final_name, desc)
                                    })
                                    added = True

                            # Contextual fallback if cell wasn't marked
                            if not added:
                                pp = detect_period_in_text(pg_text)
                                if pp:
                                    ft, fd, fm, fy, fl = pp
                                    extracted.append({
                                        'name': final_name,
                                        'description': desc,
                                        'freq_type': ft,
                                        'freq_days': fd,
                                        'freq_months': fm,
                                        'freq_years': fy,
                                        'freq_label': fl,
                                        'commissioning_date': None,
                                        'source': 'pdf_layout_a_ctx',
                                        'confidence': _score_extracted_name(final_name, desc)
                                    })

                    else:
                        # ── Layout B/C: no period keywords in column headers ──
                        # First try Layout C: scan each data row's cells for an inline period
                        # (handles tables like "Medium | 9 monthly | Workshop" where each
                        # row has its own interval in a non-header cell).
                        row_has_inline_period = False
                        layout_c_results = []
                        name_col_c = 0
                        for ci, h in enumerate(headers):
                            if any(kw in h.lower() for kw in header_kws):
                                name_col_c = ci
                                break

                        for row in rows[1:]:
                            # Find the first cell in this row that contains a period value
                            row_period = None
                            period_col_idx = None
                            for ci, cell in enumerate(row):
                                if ci == name_col_c:
                                    continue
                                if _is_standalone_period(cell):
                                    p = detect_period_in_text(cell)
                                    if p:
                                        row_period = p
                                        period_col_idx = ci
                                        break

                            if row_period:
                                row_has_inline_period = True
                                raw_name = row[name_col_c] if name_col_c < len(row) else ''
                                if not raw_name or raw_name.lower() in ('', 'none', 'nan'):
                                    # Name may be in a different column; use first non-period non-empty cell
                                    for ci, cell in enumerate(row):
                                        if ci != period_col_idx and cell and cell.lower() not in ('', 'none', 'nan'):
                                            raw_name = cell
                                            break
                                if not raw_name or raw_name.lower() in ('', 'none', 'nan'):
                                    continue

                                # Description: first non-name, non-period cell
                                desc = ''
                                for ci, cell in enumerate(row):
                                    if ci != name_col_c and ci != period_col_idx and cell:
                                        desc = cell
                                        break

                                final_name = resolve_system_name(raw_name, parent_system, False)
                                ft, fd, fm, fy, fl = row_period
                                layout_c_results.append({
                                    'name': final_name,
                                    'description': desc,
                                    'freq_type': ft,
                                    'freq_days': fd,
                                    'freq_months': fm,
                                    'freq_years': fy,
                                    'freq_label': fl,
                                    'commissioning_date': None,
                                    'source': 'pdf_layout_c',
                                    'confidence': _score_extracted_name(final_name, desc)
                                })

                        if row_has_inline_period and layout_c_results:
                            # Only use Layout C if a meaningful fraction of rows had
                            # standalone period cells (not just one incidental mention).
                            data_row_count = max(len(rows) - 1, 1)
                            if len(layout_c_results) / data_row_count >= 0.30:
                                extracted.extend(layout_c_results)
                                row_has_inline_period = True  # keep flag
                            else:
                                row_has_inline_period = False  # treat as Layout B
                        else:
                            # ── Layout B fallback: use page-level period ──
                            pp = detect_period_in_text(pg_text)
                            data_start_idx = 1

                            if pp:
                                last_seen_period = pp
                                name_col_explicit = False
                                name_col = 0
                                for ci, h in enumerate(headers):
                                    if any(kw in h.lower() for kw in header_kws):
                                        name_col = ci
                                        name_col_explicit = True
                                        break
                                last_seen_name_col = name_col
                                last_seen_name_col_explicit = name_col_explicit
                            else:
                                if last_seen_period:
                                    pp = last_seen_period
                                    name_col = last_seen_name_col
                                    name_col_explicit = last_seen_name_col_explicit

                                    h_val = headers[name_col].lower() if name_col < len(headers) else ''
                                    if not any(kw in h_val for kw in header_kws):
                                        data_start_idx = 0
                                else:
                                    continue

                            ft, fd, fm, fy, fl = pp

                            for row in rows[data_start_idx:]:
                                raw_name = row[name_col] if name_col < len(row) else ''
                                if not raw_name or raw_name.lower() in ('', 'none', 'nan'):
                                    continue

                                desc = ''
                                for ci in range(len(row)):
                                    if ci != name_col and row[ci]:
                                        desc = row[ci]
                                        break

                                final_name = resolve_system_name(raw_name, parent_system, name_col_explicit)

                                extracted.append({
                                    'name': final_name,
                                    'description': desc,
                                    'freq_type': ft,
                                    'freq_days': fd,
                                    'freq_months': fm,
                                    'freq_years': fy,
                                    'freq_label': fl,
                                    'commissioning_date': None,
                                    'source': 'pdf_layout_b',
                                    'confidence': _score_extracted_name(final_name, desc)
                                })

    except Exception as exc:
        import traceback
        traceback.print_exc()
        print(f"[pdfplumber] Failed: {exc}")

    return extracted, full_text

def extract_schedule_from_docx(file_bytes: bytes):
    """
    Extract maintenance systems from a Word document.
    """
    W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

    doc_obj = docx.Document(io.BytesIO(file_bytes))
    full_text = '\n'.join(p.text for p in doc_obj.paragraphs)

    current_period = None
    current_heading = None
    extracted = []
    
    header_kws = ('name', 'system', 'component', 'equipment', 'item', 'activity', 'task', 'check', 'action', 'description')
    condition_kws = {'low', 'medium', 'heavy', 'high', 'normal', 'severe', 'light'}
    
    def resolve_system_name(raw_name, parent_system, is_explicit_col):
        if not parent_system: return raw_name
        if raw_name.lower() in condition_kws: return f"{parent_system} - {raw_name}"
        if not is_explicit_col and parent_system.lower() not in raw_name.lower():
            return f"{parent_system} - {raw_name}"
        return raw_name

    for child in doc_obj.element.body:
        local = child.tag.split('}')[-1] if '}' in child.tag else child.tag

        if local == 'p':
            para_text = ''.join(n.text for n in child.iter(f'{{{W_NS}}}t') if n.text).strip()
            
            # Detect section heading
            m = re.match(r'^(\d+\.)+\d*\s*(.*)', para_text)
            if m and m.group(2):
                current_heading = re.sub(r'\(.*?\)', '', m.group(2)).strip()
            elif 3 <= len(para_text) <= 60 and para_text.istitle() and not detect_period_in_text(para_text):
                current_heading = para_text
                
            p = detect_period_in_text(para_text)
            if p:
                current_period = p

        elif local == 'tbl':
            rows = []
            for tr in child.iter(f'{{{W_NS}}}tr'):
                cells = []
                for tc in tr.iter(f'{{{W_NS}}}tc'):
                    cell_text = ''.join(t.text for t in tc.iter(f'{{{W_NS}}}t') if t.text)
                    cells.append(cell_text.strip())
                if any(cells):
                    rows.append(cells)

            if len(rows) < 2:
                continue

            headers = rows[0]
            period_cols = {}
            for ci, h in enumerate(headers):
                p = detect_period_in_text(h)
                if p:
                    period_cols[ci] = p

            if period_cols:
                name_col_explicit = False
                name_col = 0
                for ci, h in enumerate(headers):
                    if ci not in period_cols and any(kw in h.lower() for kw in header_kws):
                        name_col = ci
                        name_col_explicit = True
                        break
                        
                if not name_col_explicit:
                    name_col = next((ci for ci in range(len(headers)) if ci not in period_cols), 0)
                    
                for row in rows[1:]:
                    raw_name = row[name_col] if name_col < len(row) else ''
                    if not raw_name:
                        continue
                        
                    final_name = resolve_system_name(raw_name, current_heading, name_col_explicit)
                    
                    for ci, period_tuple in period_cols.items():
                        if ci < len(row) and _is_marked(row[ci]):
                            ft, fd, fm, fy, fl = period_tuple
                            extracted.append({
                                'name': final_name,
                                'description': '',
                                'freq_type': ft,
                                'freq_days': fd,
                                'freq_months': fm,
                                'freq_years': fy,
                                'freq_label': fl,
                                'commissioning_date': None,
                                'source': 'docx_layout_a',
                                'confidence': _score_extracted_name(final_name)
                            })

            elif current_period:
                # ── Layout C: try scanning each row's cells for an inline period first ──
                name_col_c = 0
                for ci, h in enumerate(headers):
                    if any(kw in h.lower() for kw in header_kws):
                        name_col_c = ci
                        break

                row_has_inline = False
                layout_c_results = []
                for row in rows[1:]:
                    row_period = None
                    period_col_idx = None
                    for ci, cell in enumerate(row):
                        if ci == name_col_c:
                            continue
                        if _is_standalone_period(cell):
                            p = detect_period_in_text(cell)
                            if p:
                                row_period = p
                                period_col_idx = ci
                                break

                    if row_period:
                        row_has_inline = True
                        raw_name = row[name_col_c] if name_col_c < len(row) else ''
                        if not raw_name:
                            for ci, cell in enumerate(row):
                                if ci != period_col_idx and cell:
                                    raw_name = cell
                                    break
                        if not raw_name:
                            continue
                        desc = ''
                        for ci, cell in enumerate(row):
                            if ci != name_col_c and ci != period_col_idx and cell:
                                desc = cell
                                break
                        final_name = resolve_system_name(raw_name, current_heading, False)
                        ft, fd, fm, fy, fl = row_period
                        layout_c_results.append({
                            'name': final_name,
                            'description': desc,
                            'freq_type': ft,
                            'freq_days': fd,
                            'freq_months': fm,
                            'freq_years': fy,
                            'freq_label': fl,
                            'commissioning_date': None,
                            'source': 'docx_layout_c',
                            'confidence': _score_extracted_name(final_name, desc)
                        })

                if row_has_inline and layout_c_results:
                    data_row_count = max(len(rows) - 1, 1)
                    if len(layout_c_results) / data_row_count >= 0.30:
                        extracted.extend(layout_c_results)
                    else:
                        row_has_inline = False  # fall through to Layout B
                else:
                    # ── Layout B fallback: use current_period for all rows ──
                    ft, fd, fm, fy, fl = current_period
                    name_col_explicit = False
                    name_col = 0
                    for ci, h in enumerate(headers):
                        if any(kw in h.lower() for kw in header_kws):
                            name_col = ci
                            name_col_explicit = True
                            break

                    for row in rows[1:]:
                        raw_name = row[name_col] if name_col < len(row) else ''
                        if not raw_name:
                            continue
                        desc = ''
                        for ci in range(len(row)):
                            if ci != name_col and row[ci]:
                                desc = row[ci]
                                break

                        final_name = resolve_system_name(raw_name, current_heading, name_col_explicit)

                        extracted.append({
                            'name': final_name,
                            'description': desc,
                            'freq_type': ft,
                            'freq_days': fd,
                            'freq_months': fm,
                            'freq_years': fy,
                            'freq_label': fl,
                            'commissioning_date': None,
                            'source': 'docx_layout_b',
                            'confidence': _score_extracted_name(final_name, desc)
                        })

    return extracted, full_text

def classify_system(name: str, description: str, retries=3) -> dict:
    for attempt in range(retries + 1):
        try:
            payload = {
                "model": AI_MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Equipment name: {name}\nDescription: {description}\n\nClassify this equipment."}
                ],
                "temperature": 0.0,
                "max_tokens": 150
            }
            headers = {"Content-Type": "application/json", "Authorization": f"Bearer {AI_API_KEY}"}
            
            response = requests.post(f"{AI_API_BASE.rstrip('/')}/v1/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            
            import re
            raw = response.json()["choices"][0]["message"]["content"].strip()
            
            # Find the first { and the last } to extract just the JSON object
            match = re.search(r'\{.*\}', raw, re.DOTALL)
            if match:
                raw = match.group(0)
                
            result = json.loads(raw)
            valid_envs = ["Test Bed", "Chassis Dyno", "Common Facilities"]
            if result.get("environment") not in valid_envs:
                result["environment"] = "Common Facilities"
                result["confidence"] = 0.0
                result["reason"] = "Could not determine environment — flagged for review."
            result["confidence"] = round(float(result.get("confidence", 0.0)), 2)
            result["status"] = "flagged" if result["confidence"] < 0.65 else "pending"
            return result
        except Exception as e:
            # If the client raised a ResponseError with status 429, retry after backoff
            import time
            if hasattr(e, "status_code") and e.status_code == 429:
                if attempt < retries:
                    time.sleep(2 ** attempt)  # exponential backoff
                    continue
            if attempt == retries:
                return {
                    "environment": "Common Facilities",
                    "confidence": 0.0,
                    "reason": f"Classification failed: {str(e)}",
                    "status": "flagged"
                }

TASK_STORE = {}

def process_classification_task(task_id, extracted_systems, doc_context=None, full_text=None):
    """
    Background worker:
    1. Perform hybrid LLM extraction on full text to find tasks missed by table parser.
    2. Classify each system's environment.
    """
    try:
        if full_text and full_text.strip():
            TASK_STORE[task_id]["current_item"] = "Scanning document for additional maintenance tasks (this may take a moment)..."
            prompt = (
                "You are an expert maintenance engineer. Extract any system or equipment "
                "and its maintenance schedule mentioned in the text. Return a JSON array "
                "of objects with keys: name, description, freq_type, freq_days, freq_months, "
                "freq_years, freq_label, confidence. "
                "Ensure the output is STRICTLY a valid JSON array."
            )
            chunk_size = 12000
            seen_keys = set((s['name'].lower().strip(), s.get('freq_label', '').lower()) for s in extracted_systems)
            keywords = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'annual', 'maintenance', 'inspection', 'check', 'every', 'interval', 'period']
            
            for i in range(0, len(full_text), chunk_size):
                chunk = full_text[i:i + chunk_size]
                if not chunk.strip(): continue
                if not any(kw in chunk.lower() for kw in keywords): continue
                
                try:
                    payload = {
                        "model": AI_MODEL,
                        "messages": [
                            {"role": "system", "content": prompt},
                            {"role": "user", "content": f"Document text:\n{chunk}"}
                        ],
                        "temperature": 0.0,
                        "max_tokens": 2000
                    }
                    hdrs = {"Content-Type": "application/json", "Authorization": f"Bearer {AI_API_KEY}"}
                    resp = requests.post(f"{AI_API_BASE.rstrip('/')}/v1/chat/completions", json=payload, headers=hdrs, timeout=60)
                    if resp.status_code == 200:
                        raw = resp.json()["choices"][0]["message"]["content"].strip()
                        import re
                        import json
                        
                        items = []
                        m = re.search(r'\[.*\]', raw, re.DOTALL)
                        if m:
                            json_str = m.group(0)
                            try:
                                items = json.loads(json_str)
                            except json.JSONDecodeError:
                                # Try to fix common JSON issues
                                json_str = re.sub(r'\}\s*\{', '}, {', json_str)
                                json_str = re.sub(r'\]\s*\[', '], [', json_str)
                                json_str = re.sub(r',\s*\]', ']', json_str)
                                json_str = re.sub(r',\s*\}', '}', json_str)
                                try:
                                    items = json.loads(json_str)
                                except Exception:
                                    pass
                        
                        if not items:
                            # Fallback: extract individual objects via regex
                            for obj_match in re.finditer(r'\{[^{}]*"name"[^{}]*\}', raw, re.DOTALL):
                                try:
                                    obj_str = re.sub(r',\s*\}', '}', obj_match.group(0))
                                    items.append(json.loads(obj_str))
                                except Exception:
                                    pass
                                    
                        for s in items:
                            if not isinstance(s, dict) or not s.get('name'): continue
                            name_str = str(s['name']).strip()
                            freq_label = str(s.get('freq_label', '')).strip()
                            key = (name_str.lower(), freq_label.lower())
                            if key not in seen_keys:
                                seen_keys.add(key)
                                ft = s.get('freq_type', 'Yearly')
                                if ft not in ['Daily', 'Weekly', 'Monthly', 'Custom', 'Yearly']:
                                    ft = 'Yearly'
                                
                                raw_conf = float(s.get('confidence', 0.5))
                                if raw_conf > 1.0:
                                    raw_conf = raw_conf / 100.0
                                # Cap LLM-extracted confidence at 0.70 — lower than table-parsed items
                                raw_conf = max(0.0, min(0.70, raw_conf))
                                
                                extracted_systems.append({
                                    'name': name_str,
                                    'description': str(s.get('description', '')).strip(),
                                    'freq_type': ft,
                                    'freq_days': int(s.get('freq_days', 0) or 0),
                                    'freq_months': int(s.get('freq_months', 0) or 0),
                                    'freq_years': int(s.get('freq_years', 0) or 0),
                                    'freq_label': freq_label if freq_label else ft,
                                    'commissioning_date': None,
                                    'source': 'llm_extraction',
                                    'confidence': raw_conf
                                })
                    # Dynamically update total items discovered
                    TASK_STORE[task_id]["total"] = len(extracted_systems)
                except Exception as e:
                    print(f"[Background LLM Extraction] Failed on chunk: {e}")

        use_doc_env = bool(doc_context and doc_context.get('confidence', 0) >= 0.80)
        TASK_STORE[task_id]["total"] = len(extracted_systems) # Ensure final total is correct

        for i, s in enumerate(extracted_systems):
            TASK_STORE[task_id]["current_item"] = s.get("name", "Unknown")

            if use_doc_env:
                s.update({
                    'environment': doc_context['environment'],
                    'classification_confidence': doc_context['confidence'],
                    'reason': doc_context.get('reason', 'Inferred from document context'),
                    'status': 'pending'
                })
            else:
                classification = classify_system(s["name"], s.get("description", ""))
                s['environment'] = classification.get('environment', 'Common Facilities')
                s['classification_confidence'] = classification.get('confidence', 0.0)
                s['reason'] = classification.get('reason', '')
                s['status'] = classification.get('status', 'pending')

            # Flag items with low extraction confidence (likely garbage/metadata)
            if s.get('confidence', 1.0) < 0.50:
                s['status'] = 'flagged'

            TASK_STORE[task_id]["progress"] = i + 1

        TASK_STORE[task_id]["status"] = "completed"
        TASK_STORE[task_id]["results"] = extracted_systems
    except Exception as e:
        import traceback
        traceback.print_exc()
        TASK_STORE[task_id]["status"] = "error"
        TASK_STORE[task_id]["error"] = str(e)

@app.route('/api/task-status/<task_id>', methods=['GET'])
def get_task_status(task_id):
    if task_id not in TASK_STORE:
        return jsonify({"error": "Task not found"}), 404
    return jsonify(TASK_STORE[task_id])

@app.route('/api/classify-document', methods=['POST'])
def classify_document():
    """
    Multi-format document ingestion endpoint.

    Pipeline
    --------
    1. Read file bytes (max 20 MB).
    2. Check AI model is reachable.
    3. Extract systems:
       - PDF  → extract_schedule_from_pdf()  (smart Layout A/B table parsing)
       - DOCX → extract_schedule_from_docx() (heading-aware paragraph scan)
       - CSV / Excel → _parse_tabular_records() (fuzzy column matching)
    4. If PDF/DOCX and no systems from tables → AI text fallback.
    5. Extract document-level environment context (one AI call).
    6. Deduplicate by (name, freq_label).
    7. Launch background classification thread.
    """
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded."}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected."}), 400

    file_bytes = file.read()
    if len(file_bytes) > 20 * 1024 * 1024:
        return jsonify({"error": "File too large. Maximum size is 20 MB."}), 413

    filename = secure_filename(file.filename)
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

    if ext not in ['pdf', 'xlsx', 'xls', 'docx', 'csv']:
        return jsonify({"error": "Unsupported file type. Please upload PDF, Excel, Word, or CSV."}), 400

    try:
        # ── Step 1: verify AI reachability ──────────────────────────
        try:
            ai_hdrs = {"Authorization": f"Bearer {AI_API_KEY}"}
            requests.get(f"{AI_API_BASE.rstrip('/')}/v1/models", headers=ai_hdrs, timeout=5)
        except requests.exceptions.RequestException:
            return jsonify({"error": f"AI model unreachable at {AI_API_BASE}. Make sure LM Studio local server is running."}), 503

        extracted_systems = []
        full_text = ""
        doc_context = None

        # ── Step 2: parse file by type ───────────────────────────────
        if ext == 'pdf':
            extracted_systems, full_text = extract_schedule_from_pdf(file_bytes)
            print(f"[PDF] Table extraction found {len(extracted_systems)} system-period entries.")

            # Get document-level environment context
            if full_text:
                doc_context = extract_document_context(full_text)

            # AI text fallback is now handled in the background classification task

        elif ext == 'docx':
            extracted_systems, full_text = extract_schedule_from_docx(file_bytes)
            print(f"[DOCX] Table extraction found {len(extracted_systems)} system-period entries.")

            if full_text:
                doc_context = extract_document_context(full_text)

        elif ext == 'csv':
            df = pd.read_csv(io.BytesIO(file_bytes))
            extracted_systems = _parse_tabular_records(df.to_dict('records'))

        elif ext in ('xlsx', 'xls'):
            df = pd.read_excel(io.BytesIO(file_bytes))
            extracted_systems = _parse_tabular_records(df.to_dict('records'))

        if not extracted_systems and not full_text:
            return jsonify({"error": "No equipment systems could be extracted from this document. Please check the file format."}), 422

        # ── Step 3: deduplicate by (name, freq_label) ────────────────
        seen = set()
        unique_systems = []
        for s in extracted_systems:
            key = (s['name'].lower().strip(), s.get('freq_label', '').lower())
            if key not in seen:
                seen.add(key)
                unique_systems.append(s)
        extracted_systems = unique_systems

        print(f"[classify_document] {len(extracted_systems)} unique entries after dedup. doc_context={doc_context}")

        # ── Step 4: launch background classification task ────────────
        task_id = str(uuid.uuid4())
        TASK_STORE[task_id] = {
            "status": "processing",
            "progress": 0,
            "total": len(extracted_systems) if extracted_systems else 1, # Prevent division by zero if empty
            "current_item": "Initializing...",
            "results": [],
            "doc_context": doc_context
        }

        thread = threading.Thread(
            target=process_classification_task,
            args=(task_id, extracted_systems, doc_context, full_text)
        )
        thread.daemon = True
        thread.start()

        return jsonify({
            "task_id": task_id,
            "message": "Classification started.",
            "doc_context": doc_context
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to process document. Details: {str(e)}"}), 500

def get_env_map():
    """Build a name->id map from the current environments in the database."""
    envs = Environment.query.all()
    return {e.name: e.id for e in envs}

@app.route('/api/verify-classification', methods=['POST'])
def verify_classification():
    data = request.json
    action = data.get('action')
    system = data.get('system')
    reviewer = data.get('reviewer', 'unknown')
    doc_source = data.get('document_source', 'unknown')
    
    if action not in ['accept', 'edit', 'hold', 'delete']:
        return jsonify({"error": "Invalid action"}), 400
        
    try:
        # Resolve maintenance frequency — prefer structured fields from new pipeline,
        # fall back to legacy 'frequency' string via normalize_frequency.
        raw_freq = system.get('freq_type') or system.get('frequency') or 'Yearly'
        if raw_freq not in ('Daily', 'Weekly', 'Monthly', 'Custom', 'Yearly'):
            raw_freq, _fd, _fm, _fy, _ = normalize_frequency(raw_freq)
        freq_type = raw_freq
        freq_days = int(system.get('freq_days', 0) or 0)
        freq_months = int(system.get('freq_months', 0) or 0)
        freq_years = int(system.get('freq_years', 0) or 0)

        comm_date_str = system.get('commissioning_date')
        try:
            comm_date = datetime.strptime(comm_date_str, '%Y-%m-%d').date() if comm_date_str else date.today()
        except Exception:
            comm_date = date.today()

        if action == 'accept':
            env_map = get_env_map()
            env_id = env_map.get(system.get('environment'), next(iter(env_map.values()), 1))
            new_eq = Equipment(
                name=system.get('name', 'Unknown'),
                description=system.get('description', ''),
                environment_id=env_id,
                commissioning_date=comm_date,
                freq_type=freq_type,
                freq_days=freq_days,
                freq_months=freq_months,
                freq_years=freq_years,
                last_maintenance_date=comm_date,
                classification_status='accepted',
                ai_confidence=system.get('classification_confidence', system.get('confidence')),
                ai_reason=system.get('reason'),
                ai_predicted_env=system.get('environment'),
                location=system.get('location') or None
            )
            db.session.add(new_eq)
            log = CorrectionLog(
                system_name=system.get('name'),
                ai_predicted=system.get('environment'),
                confidence=system.get('classification_confidence', system.get('confidence')),
                human_action='accept',
                document_source=doc_source,
                reviewer=reviewer
            )
            db.session.add(log)
            db.session.commit()
            
        elif action == 'edit':
            corrected_env = data.get('corrected_environment') or system.get('environment')
            env_map = get_env_map()
            env_id = env_map.get(corrected_env, next(iter(env_map.values()), 1))
            corrected_location = data.get('corrected_location') or None

            # Allow reviewer to override frequency during the edit step
            if 'corrected_freq_type' in data and data['corrected_freq_type']:
                freq_type = data['corrected_freq_type']
                freq_days = int(data.get('corrected_freq_days', 0) or 0)
                freq_months = int(data.get('corrected_freq_months', 0) or 0)
                freq_years = int(data.get('corrected_freq_years', 0) or 0)

            # Allow reviewer to supply a commissioning date during the edit step
            corrected_date_str = data.get('corrected_commissioning_date')
            if corrected_date_str:
                try:
                    comm_date = datetime.strptime(corrected_date_str, '%Y-%m-%d').date()
                except Exception:
                    pass  # keep existing comm_date

            new_eq = Equipment(
                name=data.get('corrected_name') or system.get('name', 'Unknown'),
                description=data.get('corrected_description') or system.get('description', ''),
                environment_id=env_id,
                commissioning_date=comm_date,
                freq_type=freq_type,
                freq_days=freq_days,
                freq_months=freq_months,
                freq_years=freq_years,
                last_maintenance_date=comm_date,
                classification_status='accepted',
                ai_confidence=system.get('confidence'),
                ai_reason=system.get('reason'),
                ai_predicted_env=system.get('environment'),
                location=corrected_location
            )
            db.session.add(new_eq)
            log = CorrectionLog(
                system_name=system.get('name'),
                ai_predicted=system.get('environment'),
                confidence=system.get('confidence'),
                human_action='edit',
                human_corrected_to=corrected_env if corrected_env != system.get('environment') else None,
                document_source=doc_source,
                reviewer=reviewer
            )
            db.session.add(log)
            db.session.commit()
            
        elif action == 'hold':
            # Store freq_label so normalize_frequency can reconstruct freq details later
            pending = PendingReview(
                ai_predicted=system.get('environment'),
                confidence=system.get('confidence'),
                reason=system.get('reason'),
                reviewer=reviewer,
                document_source=doc_source,
                name=system.get('name'),
                description=system.get('description'),
                frequency=system.get('freq_label') or system.get('freq_type') or system.get('frequency'),
                commissioning_date=system.get('commissioning_date')
            )
            db.session.add(pending)
            log = CorrectionLog(
                system_name=system.get('name'),
                ai_predicted=system.get('environment'),
                confidence=system.get('confidence'),
                human_action='hold',
                document_source=doc_source,
                reviewer=reviewer
            )
            db.session.add(log)
            db.session.commit()
            
        elif action == 'delete':
            log = CorrectionLog(
                system_name=system.get('name'),
                ai_predicted=system.get('environment'),
                confidence=system.get('confidence'),
                human_action='delete',
                document_source=doc_source,
                reviewer=reviewer
            )
            db.session.add(log)
            db.session.commit()
            
        # Also, if this came from the PendingReview tab, we should delete it from pending_review
        pending_id = data.get('pending_id')
        if pending_id and action != 'hold':
            pending_item = PendingReview.query.get(pending_id)
            if pending_item:
                db.session.delete(pending_item)
                db.session.commit()
            
        return jsonify({"message": "Action recorded successfully"}), 200
        
    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 400

@app.route('/api/pending-review', methods=['GET'])
def get_pending_review():
    pending_items = PendingReview.query.all()
    result = []
    for p in pending_items:
        result.append({
            'pending_id': p.id,
            'name': p.name,
            'description': p.description,
            'environment': p.ai_predicted,
            'confidence': p.confidence,
            'reason': p.reason,
            'frequency': p.frequency,
            'commissioning_date': p.commissioning_date,
            'document_source': p.document_source,
            'status': 'flagged' if p.confidence and p.confidence < 0.65 else 'pending'
        })
    return jsonify(result)

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.json or {}
    username = data.get('username', '')
    password = data.get('password', '')
    if secrets.compare_digest(username, ADMIN_USERNAME) and secrets.compare_digest(password, ADMIN_PASSWORD):
        return jsonify({
            'token': create_admin_token(username),
            'expires_in': ADMIN_TOKEN_MAX_AGE
        })
    return jsonify({'error': 'Invalid admin username or password'}), 401

@app.route('/api/admin/environments', methods=['GET'])
@require_admin_auth
def admin_get_environments():
    envs = Environment.query.all()
    result = []
    for e in envs:
        eq_count = Equipment.query.filter_by(environment_id=e.id).count()
        result.append({
            'id': e.id,
            'name': e.name,
            'description': e.description,
            'equipment_count': eq_count,
            'locations': [
                {'id': loc.id, 'code': loc.code, 'description': loc.description}
                for loc in sorted(e.locations, key=lambda item: item.code)
            ]
        })
    return jsonify(result)

@app.route('/api/admin/environments', methods=['POST'])
@require_admin_auth
def admin_create_environment():
    data = request.json
    if not data or not data.get('name'):
        return jsonify({'error': 'Name is required'}), 400
    env = Environment(name=data['name'], description=data.get('description', ''))
    db.session.add(env)
    db.session.commit()
    return jsonify({'id': env.id, 'name': env.name, 'description': env.description, 'equipment_count': 0}), 201

@app.route('/api/admin/environments/<int:id>', methods=['PATCH'])
@require_admin_auth
def admin_update_environment(id):
    env = Environment.query.get_or_404(id)
    data = request.json
    if 'name' in data:
        env.name = data['name']
    if 'description' in data:
        env.description = data['description']
    db.session.commit()
    return jsonify({'id': env.id, 'name': env.name, 'description': env.description})

@app.route('/api/admin/environments/<int:id>', methods=['DELETE'])
@require_admin_auth
def admin_delete_environment(id):
    env = Environment.query.get_or_404(id)
    # delete all equipments
    equipments = Equipment.query.filter_by(environment_id=env.id).all()
    for eq in equipments:
        MaintenanceHistory.query.filter_by(equipment_id=eq.id).delete()
        MaintenanceOverride.query.filter_by(equipment_id=eq.id).delete()
        db.session.delete(eq)
    
    db.session.delete(env)
    db.session.commit()
    return jsonify({'message': 'Environment and its equipments deleted'})

@app.route('/api/admin/locations', methods=['POST'])
@require_admin_auth
def admin_create_location():
    data = request.json
    if not data or not data.get('code') or not data.get('environment_id'):
        return jsonify({'error': 'Environment and location code are required'}), 400
    env = Environment.query.get_or_404(data['environment_id'])
    loc = Location(
        code=data['code'].strip(),
        description=data.get('description', ''),
        environment_id=env.id
    )
    db.session.add(loc)
    db.session.commit()
    return jsonify({
        'id': loc.id,
        'code': loc.code,
        'description': loc.description,
        'environment_id': loc.environment_id,
        'environment_name': env.name
    }), 201

@app.route('/api/admin/locations/<int:id>', methods=['PATCH'])
@require_admin_auth
def admin_update_location(id):
    loc = Location.query.get_or_404(id)
    data = request.json
    old_code = loc.code
    if 'code' in data:
        loc.code = data['code'].strip()
    if 'description' in data:
        loc.description = data['description']
    if 'environment_id' in data:
        loc.environment_id = data['environment_id']
    if old_code != loc.code:
        Equipment.query.filter_by(location=old_code).update({'location': loc.code})
    db.session.commit()
    return jsonify({
        'id': loc.id,
        'code': loc.code,
        'description': loc.description,
        'environment_id': loc.environment_id,
        'environment_name': loc.environment.name if loc.environment else None
    })

@app.route('/api/admin/locations/<int:id>', methods=['DELETE'])
@require_admin_auth
def admin_delete_location(id):
    loc = Location.query.get_or_404(id)
    Equipment.query.filter_by(location=loc.code, environment_id=loc.environment_id).update({'location': None})
    db.session.delete(loc)
    db.session.commit()
    return jsonify({'message': 'Location deleted'})

@app.route('/api/admin/equipments', methods=['GET'])
@require_admin_auth
def admin_get_equipments():
    search = request.args.get('search', '')
    query = Equipment.query
    if search:
        query = query.filter(db.or_(Equipment.name.ilike(f'%{search}%'), Equipment.serial_number.ilike(f'%{search}%')))
    equipments = query.all()
    
    result = []
    for eq in equipments:
        eq_dict = eq.to_dict()
        result.append(eq_dict)
    return jsonify(result)

if __name__ == '__main__':
    seed_database()
    app.run(debug=True, port=5000)
