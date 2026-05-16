# Maintenance Scheduling Tool

A professional, enterprise-grade web application designed to track, schedule, and document equipment maintenance across various industrial environments. Built with a robust **Python Flask** backend and a high-performance **React** frontend.

## 🚀 Key Features

- **Equipment Lifecycle Management**: Seamlessly add, edit, and categorize equipment with custom maintenance frequencies (Daily, Weekly, Monthly, Yearly, or Custom intervals).
- **Intelligent Scheduling Engine**: 
  - **10-Year Projections**: High-visibility calendar projecting maintenance tasks a decade into the future.
  - **Manual Overrides**: Reschedule specific maintenance dates without affecting the underlying recurring logic.
  - **Smart Overdue Logic**: Automatically detects overdue tasks and intelligently resets the maintenance cycle based on actual completion dates when tasks are delayed.
- **Synthesis Dashboard**: A centralized control center to monitor maintenance health.
  - **Quick Filters**: Focus on "Today's Tasks" or "Overdue" items with one click.
  - **Targeted Analysis**: Filter by Environment, Month, or Year to plan upcoming workloads.
- **Comprehensive Maintenance Logs**:
  - **Digital History**: Every completed task is logged with the date, performing personnel, and detailed descriptions.
  - **Multi-Document Support**: Upload and manage multiple service reports, calibration certificates, or photos per maintenance event.
  - **Professional Reports**: View detailed maintenance summaries in a polished, centered dialog interface.
- **Premium UI/UX**:
  - Built with **Material UI (MUI)** and **Tailwind CSS**.
  - Modern typography using the **Montserrat** and **Inter** font families.
  - Highly responsive design with interactive tooltips and smooth transitions.

---

## 🛠️ Technical Stack

- **Backend**: Python 3.11, Flask, SQLAlchemy, SQLite, python-dateutil.
- **Frontend**: React 19, Vite, Material UI v7, FullCalendar, Framer Motion, Tailwind CSS.

---

## 📦 Getting Started

### 1. Backend Setup (Flask)

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Initialize and run the server:
   ```bash
   python app.py
   ```
   *The server runs on `http://127.0.0.1:5000`. The database (`maintenance.db`) is automatically initialized and seeded on the first run.*

### 2. Frontend Setup (React/Vite)

1. Open a new terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
   *The frontend typically runs on `http://localhost:5173` or `5174`.*

---

## 📂 Project Structure

```text
├── backend/
│   ├── app.py           # Core Flask application and API endpoints
│   ├── models.py        # Database schemas (SQLAlchemy)
│   ├── uploads/         # Directory for maintenance documents
│   └── maintenance.db   # SQLite database (generated)
├── frontend/
│   ├── src/
│   │   ├── pages/       # Main views (MainPage, SynthesisDashboard)
│   │   ├── components/  # Reusable UI components (Modals, Forms)
│   │   └── api.js       # Axios API configurations
│   └── public/          # Static assets
└── README.md            # Project documentation
```

---

## 📝 Usage Notes

- **Initial Seeding**: The app comes pre-configured with environments like "Test Bed", "Chassis Dyno", and "Common Facilities".
- **File Uploads**: All uploaded maintenance documents are stored in the `backend/uploads` directory and are accessible directly through the Maintenance Logs view.
- **Calendar Interactions**: Simply click on any event in the FullCalendar view to reschedule that specific maintenance instance.
