from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import List, Dict, Union, Optional
import json
import os
from pathlib import Path
from database import Database, Field, Table
import uvicorn
import signal
import sys

app = FastAPI(title="Web DBMS")

# Initialize database
db = Database()

# Create directories if they don't exist
os.makedirs("static/js", exist_ok=True)
os.makedirs("templates", exist_ok=True)

# Get the current directory
BASE_DIR = Path(__file__).resolve().parent

# Mount static files
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

# Setup templates
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# Pydantic models for request validation
class FieldSchema(BaseModel):
    name: str
    type: str
    enum_values: Optional[List[str]] = None

class TableCreate(BaseModel):
    name: str
    schema: Optional[List[FieldSchema]] = []

class SaveRequest(BaseModel):
    path: str
    filename: str

class LoadRequest(BaseModel):
    filepath: str

# API Routes
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/api/tables")
async def create_table(table_data: TableCreate):
    try:
        # Create schema without ID field (it will be added automatically by Table class)
        schema = [
            Field(
                name=field.name,
                type_=field.type,
                enum_values=field.enum_values
            )
            for field in (table_data.schema or [])  # Handle empty schema
        ]
        
        db.create_table(table_data.name, schema)
        return {"message": f"Table {table_data.name} created successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/save")
async def save_database(save_request: SaveRequest):
    try:
        # Ensure the directory exists
        os.makedirs(save_request.path, exist_ok=True)
        
        # Create full filepath
        if not save_request.filename.endswith('.json'):
            save_request.filename += '.json'
        filepath = os.path.join(save_request.path, save_request.filename)
        
        # Save the database
        db.save_to_disk(filepath)
        return {"message": "Database saved successfully", "filepath": filepath}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/load")
async def load_database(request: Request):
    try:
        # Get filepath from request body
        try:
            body = await request.json()
            if not isinstance(body, str):
                raise HTTPException(status_code=400, detail="Request body must be a string filepath")
            filepath = body
            print(f"Attempting to load file: {filepath}")  # Debug print
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON in request body")
        
        # Check if file exists
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail=f"File not found: {filepath}")
        
        # Try to load the database
        try:
            db.load_from_disk(filepath)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON format in database file")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to load database: {str(e)}")
        
        return {"message": "Database loaded successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error loading database: {str(e)}")  # Debug print
        raise HTTPException(status_code=400, detail=f"Unexpected error: {str(e)}")

@app.get("/api/tables")
async def get_tables():
    return {"tables": list(db.tables.keys())}

@app.delete("/api/tables/{table_name}")
async def delete_table(table_name: str):
    try:
        db.delete_table(table_name)
        return {"message": f"Table {table_name} deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/api/tables/{table_name}")
async def get_table(table_name: str):
    if table_name not in db.tables:
        raise HTTPException(status_code=404, detail="Table not found")
    table = db.tables[table_name]
    return {
        "name": table_name,
        "schema": [
            {
                "name": name,
                "type": field.type,
                "enum_values": field.enum_values,
                "auto_increment": field.auto_increment
            }
            for name, field in table.schema.items()
        ],
        "rows": [row.data for row in table.rows]
    }

@app.post("/api/tables/{table_name}/rows")
async def add_row(table_name: str, row_data: Dict[str, Union[int, float, str]]):
    if table_name not in db.tables:
        raise HTTPException(status_code=404, detail="Table not found")
    try:
        db.tables[table_name].add_row(row_data)
        return {"message": "Row added successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/tables/{table_name}/rows/{row_id}")
async def edit_row(
    table_name: str,
    row_id: int,
    row_data: Dict[str, Union[int, float, str]]
):
    if table_name not in db.tables:
        raise HTTPException(status_code=404, detail="Table not found")
    try:
        db.tables[table_name].edit_row(row_id, row_data)
        return {"message": "Row updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/tables/{table_name}/rows/{row_id}")
async def delete_row(table_name: str, row_id: int):
    if table_name not in db.tables:
        raise HTTPException(status_code=404, detail="Table not found")
    try:
        db.tables[table_name].delete_row(row_id)
        return {"message": "Row deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/tables/{table_name}/columns")
async def add_column(table_name: str, column_data: FieldSchema):
    if table_name not in db.tables:
        raise HTTPException(status_code=404, detail="Table not found")
    try:
        field = Field(
            column_data.name,
            column_data.type,
            enum_values=column_data.enum_values
        )
        db.tables[table_name].add_column(field)
        return {"message": "Column added successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/tables/{table_name}/columns/{column_name}")
async def delete_column(table_name: str, column_name: str):
    if table_name not in db.tables:
        raise HTTPException(status_code=404, detail="Table not found")
    try:
        db.tables[table_name].delete_column(column_name)
        return {"message": "Column deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/directories")
async def list_directories(current_path: str = ""):
    try:
        # Convert relative path to absolute and normalize it
        base_path = os.path.abspath(current_path) if current_path else os.path.abspath(".")
        
        # Get directories and files
        items = []
        for item in os.listdir(base_path):
            full_path = os.path.join(base_path, item)
            is_dir = os.path.isdir(full_path)
            if is_dir or (os.path.isfile(full_path) and item.endswith('.json')):
                items.append({
                    "name": item,
                    "path": full_path,
                    "type": "directory" if is_dir else "file"
                })
        
        return {
            "current_path": base_path,
            "items": sorted(items, key=lambda x: (x["type"] == "file", x["name"]))
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/tables/{table_name}/search")
async def search_table(table_name: str, pattern: str):
    if table_name not in db.tables:
        raise HTTPException(status_code=404, detail="Table not found")
    table = db.tables[table_name]
    try:
        matching_rows = table.find_rows(pattern)
        return {
            "rows": [row.data for row in matching_rows]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

def signal_handler(sig, frame):
    print("\nShutting down server...")
    # Force kill the process and its children
    os._exit(0)

if __name__ == "__main__":
    try:
        # Register signal handler for graceful shutdown
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # Configure and start the server
        config = uvicorn.Config(
            app=app,
            host="127.0.0.1",
            port=8000,
            reload=False,  # Disable reload to make shutdown cleaner
            log_level="info"
        )
        server = uvicorn.Server(config)
        
        print("Starting server... Press Ctrl+C to stop.")
        server.run()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        os._exit(0)
