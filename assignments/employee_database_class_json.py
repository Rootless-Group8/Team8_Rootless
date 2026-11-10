import json
import os

class EmployeeDatabase:
    def __init__(self,FILE_PATH="employee_records_DB.json"):
        """Initialize by ensuring the JSON file exists."""
        self.FILE_PATH=FILE_PATH
        if not os.path.exists(self.FILE_PATH):
            with open(self.FILE_PATH, "w") as file:
                json.dump([], file)  # Start with an empty list

    def _read_json(self):
        """Read and return data from the JSON file."""
        with open(self.FILE_PATH, "r") as file:
            return json.load(file)

    def _write_json(self, data):
        """Write data to the JSON file."""
        with open(self.FILE_PATH, "w") as file:
            json.dump(data, file, indent=4)

    def insert_employee(self, first_name, last_name, birthdate, hire_date, job_title):
        """Insert a new employee into the JSON file."""
        employees = self._read_json()
        employee_id = len(employees) + 1  # Auto-increment ID
        employees.append({
            "id": employee_id,
            "first_name": first_name,
            "last_name": last_name,
            "birthdate": birthdate,
            "hire_date": hire_date,
            "job_title": job_title
        })
        self._write_json(employees)

    def get_employee(self, first_name, last_name):
        """Retrieve a specific employee by name."""
        employees = self._read_json()
        for emp in employees:
            if emp["first_name"] == first_name and emp["last_name"] == last_name:
                return \
                "ID: " + str(emp['id']) + ", " + \
                "Name: " + emp['first_name'] + " " + emp['last_name'] + ", " \
                "Birthdate: " + str(emp['birthdate']) + ", " + \
                "Hire Date: " + str(emp['hire_date']) + ", " + \
                "Job Title: " + str(emp['job_title'])
                
                
        return None  # Employee not found

    def get_all_employees(self):
        """Retrieve all employees."""
        return self._read_json()