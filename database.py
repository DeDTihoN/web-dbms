import re
import json
from typing import List, Dict, Union, Optional

class Field:
    def __init__(self, name: str, type_: str, enum_values: Optional[List[str]] = None, auto_increment: bool = False):
        self.name = name
        self.type = type_
        self.enum_values = enum_values
        self.auto_increment = auto_increment

    def validate(self, value):
        if value is None and self.auto_increment:
            return True
        if self.type == "integer":
            return isinstance(value, int)
        elif self.type == "real":
            return isinstance(value, float)
        elif self.type == "char":
            return isinstance(value, str) and len(value) == 1
        elif self.type == "string":
            return isinstance(value, str)
        elif self.type == "email":
            return isinstance(value, str) and re.match(r"[^@]+@[^@]+\.[^@]+", value) is not None
        elif self.type == "enum":
            if self.enum_values is None:
                raise ValueError(f"Enum field '{self.name}' does not have defined values.")
            return value in self.enum_values
        else:
            return False

class Row:
    def __init__(self, data: Dict[str, Union[int, float, str]]):
        self.data = data

class Table:
    def __init__(self, name: str, schema: List[Field]):
        self.name = name
        self.schema = {field.name: field for field in schema}
        self.rows = []
        self._auto_increment_value = 1
        
        # Add ID field if not present
        if 'id' not in self.schema:
            id_field = Field('id', 'integer', auto_increment=True)
            self.schema = {'id': id_field, **self.schema}

    def add_row(self, row: Dict[str, Union[int, float, str]]):
        # Handle auto-increment ID
        if 'id' not in row or row['id'] is None:
            row['id'] = self._auto_increment_value
            self._auto_increment_value += 1

        for field_name, field in self.schema.items():
            if field_name not in row and not field.auto_increment:
                raise ValueError(f"Missing value for field {field_name}")
            if field_name in row and not field.validate(row[field_name]):
                raise ValueError(f"Invalid value for field {field_name}")
        
        self.rows.append(Row(row))

    def delete_row(self, row_id: int):
        if row_id < 0 or row_id >= len(self.rows):
            raise IndexError("Row ID out of range")
        self.rows.pop(row_id)

    def edit_row(self, row_id: int, new_data: Dict[str, Union[int, float, str]]):
        if row_id < 0 or row_id >= len(self.rows):
            raise IndexError("Row ID out of range")
        # Preserve the ID
        new_data['id'] = self.rows[row_id].data['id']
        self.rows[row_id] = Row(new_data)

    def add_column(self, field: Field):
        if field.name in self.schema:
            raise ValueError(f"Column {field.name} already exists")
        self.schema[field.name] = field
        # Initialize new column with None values
        for row in self.rows:
            row.data[field.name] = None

    def delete_column(self, field_name: str):
        if field_name == 'id':
            raise ValueError("Cannot delete ID column")
        if field_name not in self.schema:
            raise ValueError(f"Column {field_name} does not exist")
        del self.schema[field_name]
        # Remove column data from all rows
        for row in self.rows:
            if field_name in row.data:
                del row.data[field_name]

    def find_rows(self, pattern: str) -> List[Row]:
        regex = re.compile(pattern, re.IGNORECASE)
        return [row for row in self.rows if any(regex.search(str(value)) for value in row.data.values())]

class Database:
    def __init__(self):
        self.tables = {}

    def create_table(self, name: str, schema: List[Field]):
        if name in self.tables:
            raise ValueError("Table already exists")
        self.tables[name] = Table(name, schema)

    def delete_table(self, name: str):
        if name not in self.tables:
            raise ValueError("Table does not exist")
        del self.tables[name]

    def save_to_disk(self, filepath: str):
        data = {
            table_name: {
                "schema": [
                    {
                        "name": field.name,
                        "type": field.type,
                        "enum_values": field.enum_values,
                        "auto_increment": field.auto_increment
                    }
                    for field in table.schema.values()
                ],
                "rows": [row.data for row in table.rows],
                "auto_increment_value": table._auto_increment_value
            }
            for table_name, table in self.tables.items()
        }
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)

    def load_from_disk(self, filepath: str):
        with open(filepath, "r") as f:
            data = json.load(f)
        # Instead of clearing tables, merge with existing ones
        for table_name, table_data in data.items():
            schema = [
                Field(
                    name=field["name"],
                    type_=field["type"],
                    enum_values=field.get("enum_values"),
                    auto_increment=field.get("auto_increment", False)
                )
                for field in table_data["schema"]
            ]
            # If table exists, add counter to name
            final_name = table_name
            counter = 1
            while final_name in self.tables:
                final_name = f"{table_name}_{counter}"
                counter += 1
            
            table = Table(final_name, schema)
            table._auto_increment_value = table_data.get("auto_increment_value", 1)
            for row_data in table_data["rows"]:
                table.rows.append(Row(row_data))
            self.tables[final_name] = table
