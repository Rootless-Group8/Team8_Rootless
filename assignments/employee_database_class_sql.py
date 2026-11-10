import sqlite3

class EmployeeDatabase:
    def __init__(self, db_name="employee_records_DB.sql"):
        """Initialize the database connection and create the table if it doesn't exist."""
        self.db_name = db_name
        self.conn = sqlite3.connect(db_name)
        self.cursor = self.conn.cursor()
        self._create_table()
        
    def __del__(self):
        self.close_connection()

    def _create_table(self):
        """Create the employees table if it doesn't already exist."""
        self.cursor.execute('''
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            birthdate DATE NOT NULL,
            hire_date DATE NOT NULL,
            job_title TEXT NOT NULL
        )
        ''')
        self.conn.commit()

    def insert_employee(self, first_name, last_name, birthdate, hire_date, job_title):
        """Insert a new employee into the database."""
        self.cursor.execute('''
        INSERT INTO employees (first_name, last_name, birthdate, hire_date, job_title)
        VALUES (?, ?, ?, ?, ?)
        ''', (first_name, last_name, birthdate, hire_date, job_title))
        self.conn.commit()

    def get_employee(self, first_name, last_name):
        """Fetch an employee by first and last name."""
        self.cursor.execute('''
        SELECT * FROM employees WHERE first_name = ? AND last_name = ?
        ''', (first_name, last_name))
        employee = self.cursor.fetchone()
        return \
            f"ID: {employee[0]}, Name: {employee[1]} {employee[2]}, Birthdate: {employee[3]}, Hire Date: {employee[4]}, Job Title: {employee[5]}"

    def get_all_employees(self):
        """Retrieve all employee records."""
        self.cursor.execute('SELECT * FROM employees')
        return self.cursor.fetchall()

    def close_connection(self):
        """Close the database connection."""
        self.conn.close()
        #print(f"Connection to SQL Database {self.db_name} closed.")
        
        
 
