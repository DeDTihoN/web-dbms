# Web DBMS

A web-based version of the desktop DBMS application, built with FastAPI and modern web technologies.

## Features

- Create and manage tables with custom schemas
- Add, edit, and delete rows
- Add and delete columns
- Support for different data types:
  - Integer
  - Real (float)
  - Char
  - String
  - Email
  - Enum
- Save and load database from disk
- Modern, responsive web interface
- RESTful API

## Setup

1. Install the required dependencies:
```bash
pip install -r requirements.txt
```

2. Run the FastAPI server:
```bash
uvicorn main:app --reload
```

3. Open your browser and navigate to `http://localhost:8000`

## API Documentation

The API documentation is automatically generated and can be accessed at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Project Structure

- `main.py` - FastAPI application and API routes
- `database.py` - Database implementation
- `templates/index.html` - Main web interface
- `static/js/app.js` - Frontend JavaScript code
- `requirements.txt` - Python dependencies

## Usage

1. Create a new table:
   - Click "New Table"
   - Enter table name and schema
   - Schema format: `name:type[:enum_values]`
   - Example:
     ```
     name:string
     age:integer
     status:enum:active,inactive,pending
     ```

2. Manage rows:
   - Add rows with the "Add Row" button
   - Edit rows using the pencil icon
   - Delete rows using the trash icon

3. Manage columns:
   - Add columns with the "Add Column" button
   - Delete columns from the table view

4. Save/Load Database:
   - Use "Save DB" to save the current state
   - Use "Load DB" to restore a saved state 