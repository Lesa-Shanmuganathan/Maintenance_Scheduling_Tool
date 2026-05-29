from flask import Flask, request, jsonify, send_from_directory
import os
from werkzeug.utils import secure_filename
from flask_cors import CORS
from models import db, Environment, Equipment, MaintenanceOverride, MaintenanceHistory, PendingReview, CorrectionLog
import pandas as pd
import pdfplumber
import docx
import requests
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
import uuid
import threading
from sqlalchemy import text
from dateutil.relativedelta import relativedelta
from datetime import datetime, date

# LM Studio defaults to http://localhost:1234
AI_API_BASE = os.getenv("AI_API_BASE", "http://localhost:1234")
AI_API_KEY = os.getenv("AI_API_KEY", "lm-studio")
AI_MODEL = os.getenv("AI_MODEL", "local-model") # LM studio ignores this and uses the loaded model

app = Flask(__name__)
UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///maintenance.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

CORS(app)
db.init_app(app)

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
            "ALTER TABLE environments ADD COLUMN description TEXT;"
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

def calculate_next_maintenance(last_date, freq_type, freq_days=0, freq_months=0, freq_years=0):
    if freq_type == 'Daily':
        return last_date + relativedelta(days=1)
    elif freq_type == 'Weekly':
        return last_date + relativedelta(weeks=1)
    elif freq_type == 'Monthly':
        return last_date + relativedelta(months=1)
    elif freq_type == 'Yearly':
        return last_date + relativedelta(years=1)
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
    return jsonify([{'id': e.id, 'name': e.name, 'description': e.description} for e in envs])

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
            serial_number=data.get('serial_number')
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
    
    if not env_id or not month or not year:
        return jsonify({'error': 'Missing parameters'}), 400
        
    try:
        month = int(month)
        year = int(year)
    except:
        return jsonify({'error': 'Invalid month or year'}), 400
        
    query = Equipment.query.filter_by(environment_id=env_id)
    equipments = query.all()
    
    from datetime import date
    from dateutil.relativedelta import relativedelta
    results = []
    
    for eq in equipments:
        if eq.standby == 1:
            continue
            
        overrides = MaintenanceOverride.query.filter_by(equipment_id=eq.id).all()
        override_dict = {o.original_date: o.new_date for o in overrides}
        
        limit_date = date(year + 1 if month == 12 else year, 1 if month == 12 else month + 1, 1) - relativedelta(days=1)
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
                    'status': status
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

def process_classification_task(task_id, extracted_systems):
    try:
        total = len(extracted_systems)
        for i, s in enumerate(extracted_systems):
            TASK_STORE[task_id]["current_item"] = s.get("name", "Unknown")
            
            classification = classify_system(s["name"], s.get("description", ""))
            s.update(classification)
            
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
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded."}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected."}), 400
        
    if len(file.read()) > 20 * 1024 * 1024:
        return jsonify({"error": "File too large. Maximum size is 20 MB."}), 413
    file.seek(0)
    
    filename = secure_filename(file.filename)
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    
    if ext not in ['pdf', 'xlsx', 'xls', 'docx', 'csv']:
        return jsonify({"error": "Unsupported file type. Please upload PDF, Excel, Word, or CSV."}), 400

    try:
        # Check if AI model host is reachable
        try:
            headers = {"Authorization": f"Bearer {AI_API_KEY}"}
            
            # Check LM Studio / OpenAI compatible endpoint
            requests.get(f"{AI_API_BASE.rstrip('/')}/v1/models", headers=headers, timeout=5)
        except requests.exceptions.RequestException:
            return jsonify({"error": f"AI model unreachable at {AI_API_BASE}. Make sure LM Studio local server is running."}), 503

        systems = []
        if ext == 'csv':
            df = pd.read_csv(file)
            systems = df.to_dict('records')
        elif ext in ['xlsx', 'xls']:
            df = pd.read_excel(file)
            systems = df.to_dict('records')
        elif ext == 'pdf':
            with pdfplumber.open(file) as pdf:
                for page in pdf.pages:
                    table = page.extract_table()
                    if table and len(table) > 1:
                        headers = [str(h).lower().strip() for h in table[0]]
                        for row in table[1:]:
                            record = {}
                            for i, cell in enumerate(row):
                                if i < len(headers):
                                    record[headers[i]] = cell
                            systems.append(record)
        elif ext == 'docx':
            doc = docx.Document(file)
            for table in doc.tables:
                if not table.rows: continue
                headers = [cell.text.lower().strip() for cell in table.rows[0].cells]
                for row in table.rows[1:]:
                    record = {}
                    for i, cell in enumerate(row.cells):
                        if i < len(headers):
                            record[headers[i]] = cell.text
                    systems.append(record)
        
        # Parse records into structured format using fuzzy header matching
        extracted_systems = []
        
        def find_value(row, keywords):
            for key, val in row.items():
                if not isinstance(key, str):
                    continue
                k_lower = key.lower().strip()
                for kw in keywords:
                    if kw in k_lower:
                        return val
            return None

        for s in systems:
            # Look for name using common unstructured variations
            name = find_value(s, ['system name', 'equipment name', 'system', 'equipment', 'name', 'item', 'asset'])
            if not name or pd.isna(name):
                continue
                
            desc = find_value(s, ['description', 'details', 'notes', 'spec', 'info'])
            freq = find_value(s, ['frequency', 'interval', 'cycle', 'maintenance'])
            comm_date = find_value(s, ['commissioning', 'comm date', 'commission', 'date', 'installed'])
            
            # Convert pandas NaN to None
            extracted_systems.append({
                "name": str(name).strip(),
                "description": str(desc).strip() if pd.notna(desc) else "",
                "frequency": str(freq).strip() if pd.notna(freq) else None,
                "commissioning_date": str(comm_date).strip() if pd.notna(comm_date) else None
            })
            
        if not extracted_systems:
            return jsonify({"error": "No equipment systems could be extracted from this document. Please check the file format."}), 422
            
        task_id = str(uuid.uuid4())
        TASK_STORE[task_id] = {
            "status": "processing",
            "progress": 0,
            "total": len(extracted_systems),
            "current_item": "Initializing...",
            "results": []
        }
        
        thread = threading.Thread(target=process_classification_task, args=(task_id, extracted_systems))
        thread.daemon = True
        thread.start()
        
        return jsonify({"task_id": task_id, "message": "Classification started."})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to process document. Details: {str(e)}"}), 500

ENV_MAP = {"Test Bed": 1, "Chassis Dyno": 2, "Common Facilities": 3}

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
        freq_type = system.get('frequency') or 'Yearly'
        comm_date_str = system.get('commissioning_date')
        try:
            comm_date = datetime.strptime(comm_date_str, '%Y-%m-%d').date() if comm_date_str else date.today()
        except:
            comm_date = date.today()
            
        if action == 'accept':
            env_id = ENV_MAP.get(system.get('environment'), 3)
            new_eq = Equipment(
                name=system.get('name', 'Unknown'),
                description=system.get('description', ''),
                environment_id=env_id,
                commissioning_date=comm_date,
                freq_type=freq_type,
                last_maintenance_date=comm_date,
                classification_status='accepted',
                ai_confidence=system.get('confidence'),
                ai_reason=system.get('reason'),
                ai_predicted_env=system.get('environment')
            )
            db.session.add(new_eq)
            log = CorrectionLog(
                system_name=system.get('name'),
                ai_predicted=system.get('environment'),
                confidence=system.get('confidence'),
                human_action='accept',
                document_source=doc_source,
                reviewer=reviewer
            )
            db.session.add(log)
            db.session.commit()
            
        elif action == 'edit':
            corrected_env = data.get('corrected_environment') or system.get('environment')
            env_id = ENV_MAP.get(corrected_env, 3)
            new_eq = Equipment(
                name=data.get('corrected_name') or system.get('name', 'Unknown'),
                description=data.get('corrected_description') or system.get('description', ''),
                environment_id=env_id,
                commissioning_date=comm_date,
                freq_type=freq_type,
                last_maintenance_date=comm_date,
                classification_status='accepted',
                ai_confidence=system.get('confidence'),
                ai_reason=system.get('reason'),
                ai_predicted_env=system.get('environment')
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
            pending = PendingReview(
                ai_predicted=system.get('environment'),
                confidence=system.get('confidence'),
                reason=system.get('reason'),
                reviewer=reviewer,
                document_source=doc_source,
                name=system.get('name'),
                description=system.get('description'),
                frequency=system.get('frequency'),
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

@app.route('/api/admin/environments', methods=['GET'])
def admin_get_environments():
    envs = Environment.query.all()
    result = []
    for e in envs:
        eq_count = Equipment.query.filter_by(environment_id=e.id).count()
        result.append({
            'id': e.id,
            'name': e.name,
            'description': e.description,
            'equipment_count': eq_count
        })
    return jsonify(result)

@app.route('/api/admin/environments', methods=['POST'])
def admin_create_environment():
    data = request.json
    if not data or not data.get('name'):
        return jsonify({'error': 'Name is required'}), 400
    env = Environment(name=data['name'], description=data.get('description', ''))
    db.session.add(env)
    db.session.commit()
    return jsonify({'id': env.id, 'name': env.name, 'description': env.description, 'equipment_count': 0}), 201

@app.route('/api/admin/environments/<int:id>', methods=['PATCH'])
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

@app.route('/api/admin/equipments', methods=['GET'])
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


