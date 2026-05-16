from flask import Flask, request, jsonify, send_from_directory
import os
from werkzeug.utils import secure_filename
from flask_cors import CORS
from models import db, Environment, Equipment, MaintenanceOverride, MaintenanceHistory, PendingReview, CorrectionLog
import pandas as pd
import pdfplumber
import docx
import ollama
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy import text
from dateutil.relativedelta import relativedelta
from datetime import datetime, date
from ollama import Client

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "https://ollama.com")
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4:e4b-cloud")

# Ensure the host does not contain a trailing '/api' path, which would cause duplicate endpoints when the client appends its own '/api' routes.
if OLLAMA_HOST.rstrip("/").endswith("/api"):
    OLLAMA_HOST = OLLAMA_HOST.rstrip("/")[: -4]

ollama_client_kwargs = {"host": OLLAMA_HOST}
if OLLAMA_API_KEY:
    ollama_client_kwargs["headers"] = {"Authorization": f"Bearer {OLLAMA_API_KEY}"}

ollama_client = Client(**ollama_client_kwargs)

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
    return jsonify([{'id': e.id, 'name': e.name} for e in envs])

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
            last_maintenance_date=last_m_dt
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
        
        db.session.commit()
        return jsonify(eq.to_dict()), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/equipments/<int:id>', methods=['DELETE'])
def delete_equipment(id):
    eq = Equipment.query.get_or_404(id)
    db.session.delete(eq)
    db.session.commit()
    return jsonify({'message': 'Deleted successfully'}), 200

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

SYSTEM_PROMPT = """You are an expert equipment classifier for AVL, a professional automotive 
testing company. AVL operates test facilities with three distinct environments. 
Your job is to classify maintenance equipment into exactly one of these three 
environments based on its name and description.

ENVIRONMENT 1 — TEST BED
A Test Bed (also called an engine testbed or powertrain testbed) is a controlled 
environment where engines, motors, or powertrain components are tested in 
isolation — not inside a vehicle. Equipment here is directly attached to or 
serves a single engine test cell.

What belongs here:
- Engine dynamometers and powertrain dynamometers (AC induction motors used 
  as load units for engine or powertrain testing)
- Throttle actuators, brake actuators, clutch actuators, gear-shift robots 
  (used to automate engine/powertrain test runs)
- High-precision sensors for engine parameters: temperature sensors, pressure 
  sensors, blow-by measurement devices, lambda sensors, torque sensors
- Test rigs for individual powertrain components (gearbox test rigs, 
  transmission test rigs, e-motor test rigs)
- Cooling systems dedicated to a single test cell (not shared across the 
  facility) — e.g. coolant conditioning units specific to one engine cell
- Pumps and valves that serve a specific engine test cell's fluid circuits
- Electronic controllers managing a single test cell's automation
- Air measurement and conditioning units for engine intake/exhaust on a 
  specific test cell
- Battery emulators and e-storage equipment used on a specific test cell
- Test cell workstations and PUMA automation computers for a specific cell

Keywords to watch for: test bed, test cell, engine, powertrain, transmission, 
dynamometer (in engine context), actuator, throttle, blow-by, lambda, 
combustion, torque, e-motor, HV (High Voltage powertrain), cell-specific.

ENVIRONMENT 2 — CHASSIS DYNO
A Chassis Dynamometer tests a complete vehicle (not a bare engine) by placing 
the vehicle's driven wheels on rollers. The vehicle is driven as if on a road 
while the dynamometer measures performance and emissions. Based on the 
AVL ROADSIM system manual, this environment contains:

What belongs here:
- Roller sets (the physical rollers the vehicle wheels sit on)
- Roller locking devices and pneumatic cabinets (hold rollers in place)
- 4-quadrant AC electric motors that drive the chassis dyno rollers
- Drive chains, chain wheels, pendulum bearings, motor bearings for rollers
- Automatic centering devices (guides the vehicle wheels onto the rollers)
- Automatic roller coverings (protective covers over the roller pit)
- Vehicle restraint systems: rods, hooks, belts, chains, T-bolts, sliding 
  anchors that secure the vehicle to the chassis dyno
- Power cabinets and control cabinets for the chassis dyno system
- VECON control computers (VECON 2016, VECON 2™) — the operating and 
  control system for chassis dynamometer vehicle testing
- Cable remote controls, operation panels, signal towers for chassis dyno
- Load cells and calibration devices (measure tractive force on the dyno)
- Incremental encoders, absolute encoders, coupling and alignment units
- Traversing units and traversing rails (move the front axle position)
- Earthing brushes (electrical grounding on rotating parts)
- AK-Interface, Augmented Braking, coastdown equipment
- Safety control systems specific to the chassis dyno
- Interface to vehicle cooling fan (the large fan that cools the vehicle 
  during dyno testing)
- Climatic chambers (optional enclosure around chassis dyno for temperature 
  and humidity testing)
- NVH (Noise, Vibration, Harshness) equipment on a chassis dyno cell
- EMC testing equipment on a chassis dyno cell
- ROADSIM systems and components

Keywords to watch for: chassis, roller, dyno (vehicle context), ROADSIM, 
VECON, restraint, centering, locking, traversing, load cell, encoder, 
vehicle testing, road simulation, roller covering, 2WD, 4WD vehicle.

ENVIRONMENT 3 — COMMON FACILITIES
Common Facilities are shared utility infrastructure that serves multiple test 
cells or the entire test facility building. This equipment is not dedicated to 
one specific test cell — it supplies resources to many cells simultaneously.

What belongs here:
- Central cooling systems supplying chilled water to multiple test cells 
  (cooling towers, chillers, central coolant distribution systems)
- Shared pumps distributing water, oil, coolant, or fuel across the facility
- Compressed air supply systems serving multiple cells (compressors, air 
  dryers, distribution pipework)
- Central electrical distribution equipment (main switchboards, UPS systems, 
  power distribution panels serving multiple cells)
- Building HVAC systems (ventilation, air handling units, exhaust extraction 
  systems for the whole building)
- Demineralised water systems and wastewater treatment equipment
- Shared electronic controllers and building management systems
- Fuel supply systems (shared fuel tanks, fuel distribution to multiple cells)
- Shared data networks and facility-wide communication infrastructure
- Fire suppression and safety systems covering the building
- Shared test rigs or equipment that is moved between cells and not 
  permanently assigned to one

Keywords to watch for: common, shared, central, facility, building, utility, 
supply, distribution, multi-cell, HVAC, compressed air, chilled water, 
demineralised, fuel supply, wastewater.

---

IMPORTANT RULES:
1. Reply ONLY with valid JSON. No explanation before or after. No markdown fences.
2. Use exactly this format:
   {"environment": "Test Bed", "confidence": 0.88, "reason": "One sentence explanation."}
3. environment must be exactly one of: Test Bed, Chassis Dyno, Common Facilities
4. confidence is a float from 0.0 to 1.0
5. If the name is too vague to classify reliably (e.g. "system - 1", "HV", 
   "sample"), set confidence below 0.65 to flag it for human review
6. reason must be one sentence explaining the key signal that drove the decision"""

def classify_system(name: str, description: str, retries=3) -> dict:
    for attempt in range(retries + 1):
        try:
            response = ollama_client.chat(
                model=OLLAMA_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Equipment name: {name}\nDescription: {description}\n\nClassify this equipment."}
                ],
                options={"temperature": 0}
            )
            raw = response["message"]["content"].strip()
            if "```" in raw:
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()
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

def classify_batch(systems: list) -> list:
    # Reduce concurrency to avoid hitting rate limits (max 3 workers)
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [
            executor.submit(classify_system, s["name"], s.get("description", ""))
            for s in systems
        ]
        results = [f.result() for f in futures]
    return results

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
        import requests
        try:
            headers = {}
            if OLLAMA_API_KEY:
                headers["Authorization"] = f"Bearer {OLLAMA_API_KEY}"
            
            # Simplified connection check
            requests.get(f"{OLLAMA_HOST.rstrip('/')}/api/tags", headers=headers, timeout=5)
        except requests.exceptions.RequestException:
            return jsonify({"error": f"AI model unreachable at {OLLAMA_HOST}."}), 503

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
            
        classifications = classify_batch(extracted_systems)
        for i, s in enumerate(extracted_systems):
            s.update(classifications[i])
            
        return jsonify(extracted_systems)

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

if __name__ == '__main__':
    seed_database()
    app.run(debug=True, port=5000)


