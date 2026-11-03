# Joe Waclawski
# CIS454 Adapter example
# this python script will write and read a single record from either an SQL database
# or Json file. Simply import the correct class below
# this can be expanded to any type of datafile by writing a new Adapter

# import (uncomment) only the interface you want to use
# add others as necessary

#uncomment the following to store employee records data in Json
#from employee_database_class_json import EmployeeDatabase

#uncomment the following to store employee records data in SQL
from employee_database_class_sql import EmployeeDatabase


# 
# Create an instance of EmployeeDatabase, from whichever interface we want
db = EmployeeDatabase()

def CreateRecord(target: "Target") -> None:
    target.insert_employee("John", "Doe", "1980-01-15", "2020-06-10", "Software Engineer")
    
# Insert a sample employee
db.insert_employee("John", "Doe", "1980-01-15", "2020-06-10", "Software Engineer")

# Fetch and display a specific employee
employee = db.get_employee("John", "Doe")
if employee:
    print(employee);
else:
    print("Employee not found.")
