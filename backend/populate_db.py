import random
from datetime import date, timedelta
from app import app
from models import db, Environment, Equipment

def seed_sample_data():
    with app.app_context():
        # Get environments
        envs = Environment.query.all()
        if not envs:
            print("No environments found. Please run the app first to seed environments.")
            return
            
        # Sample adjectives and nouns for names
        adj = ["High-Precision", "Heavy-Duty", "Digital", "Industrial", "Advanced", "Standard", "Mobile", "Stationary"]
        nouns = ["Test Rig", "Sensor", "Dyno", "Cooling System", "Electronic Controller", "Actuator", "Valve", "Pump"]
        
        freq_types = ["Daily", "Weekly", "Monthly", "Yearly", "Custom"]
        
        for i in range(50):
            env = random.choice(envs)
            name = f"{random.choice(adj)} {random.choice(nouns)} #{i+1}"
            description = f"Sample equipment for {env.name} used in testing cycle {random.randint(1, 10)}."
            
            # Commissioning date within the last 2 years
            days_ago = random.randint(0, 730)
            comm_date = date.today() - timedelta(days=days_ago)
            
            # Frequency
            ftype = random.choice(freq_types)
            fdays = 0
            fmonths = 0
            fyears = 0
            
            if ftype == "Custom":
                fdays = random.randint(1, 30)
                fmonths = random.randint(0, 6)
                fyears = random.randint(0, 1)
            
            new_eq = Equipment(
                name=name,
                description=description,
                environment_id=env.id,
                commissioning_date=comm_date,
                freq_type=ftype,
                freq_days=fdays,
                freq_months=fmonths,
                freq_years=fyears,
                last_maintenance_date=comm_date # Initially same as comm date
            )
            db.session.add(new_eq)
            
        db.session.commit()
        print("Successfully added 50 sample data entries.")

if __name__ == "__main__":
    seed_sample_data()
