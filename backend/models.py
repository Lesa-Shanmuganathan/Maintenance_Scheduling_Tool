from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Environment(db.Model):
    __tablename__ = 'environments'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    
    equipments = db.relationship('Equipment', backref='environment', lazy=True)

class Equipment(db.Model):
    __tablename__ = 'equipments'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    environment_id = db.Column(db.Integer, db.ForeignKey('environments.id'), nullable=False)
    commissioning_date = db.Column(db.Date, nullable=False)
    freq_type = db.Column(db.String(20), nullable=False) # 'Daily', 'Weekly', 'Monthly', 'Yearly', 'Custom'
    freq_days = db.Column(db.Integer, default=0)
    freq_months = db.Column(db.Integer, default=0)
    freq_years = db.Column(db.Integer, default=0)
    last_maintenance_date = db.Column(db.Date, nullable=False)
    classification_status = db.Column(db.String(20), nullable=True)
    ai_confidence = db.Column(db.Float, nullable=True)
    ai_reason = db.Column(db.Text, nullable=True)
    ai_predicted_env = db.Column(db.String(50), nullable=True)
    serial_number = db.Column(db.String(100), nullable=True)
    standby = db.Column(db.Integer, default=0)
    standby_since = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'environment_id': self.environment_id,
            'environment_name': self.environment.name if self.environment else None,
            'commissioning_date': self.commissioning_date.isoformat(),
            'freq_type': self.freq_type,
            'freq_days': self.freq_days,
            'freq_months': self.freq_months,
            'freq_years': self.freq_years,
            'last_maintenance_date': self.last_maintenance_date.isoformat(),
            'classification_status': self.classification_status,
            'ai_confidence': self.ai_confidence,
            'ai_reason': self.ai_reason,
            'ai_predicted_env': self.ai_predicted_env,
            'serial_number': self.serial_number,
            'standby': self.standby,
            'standby_since': self.standby_since.isoformat() if self.standby_since else None
        }

class MaintenanceOverride(db.Model):
    __tablename__ = 'maintenance_overrides'
    id = db.Column(db.Integer, primary_key=True)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipments.id'), nullable=False)
    original_date = db.Column(db.Date, nullable=False)
    new_date = db.Column(db.Date, nullable=False)

class MaintenanceHistory(db.Model):
    __tablename__ = 'maintenance_history'
    id = db.Column(db.Integer, primary_key=True)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipments.id'), nullable=False)
    completion_date = db.Column(db.Date, nullable=False)
    person = db.Column(db.String(100), nullable=True)
    description = db.Column(db.Text, nullable=True)
    document_path = db.Column(db.String(255), nullable=True)
    
    equipment = db.relationship('Equipment', backref='maintenance_history', lazy=True)

class PendingReview(db.Model):
    __tablename__ = 'pending_review'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    equipment_id = db.Column(db.Integer, nullable=True)
    ai_predicted = db.Column(db.String(50), nullable=True)
    confidence = db.Column(db.Float, nullable=True)
    reason = db.Column(db.Text, nullable=True)
    rejection_ts = db.Column(db.DateTime, default=datetime.utcnow)
    reviewer = db.Column(db.String(100), nullable=True)
    document_source = db.Column(db.String(255), nullable=True)
    
    # Store system details needed for review
    name = db.Column(db.String(200), nullable=True)
    description = db.Column(db.Text, nullable=True)
    frequency = db.Column(db.String(50), nullable=True)
    commissioning_date = db.Column(db.String(50), nullable=True)

class CorrectionLog(db.Model):
    __tablename__ = 'correction_log'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    system_name = db.Column(db.String(200), nullable=True)
    ai_predicted = db.Column(db.String(50), nullable=True)
    confidence = db.Column(db.Float, nullable=True)
    human_action = db.Column(db.String(20), nullable=True)
    human_corrected_to = db.Column(db.String(50), nullable=True)
    document_source = db.Column(db.String(255), nullable=True)
    reviewer = db.Column(db.String(100), nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
