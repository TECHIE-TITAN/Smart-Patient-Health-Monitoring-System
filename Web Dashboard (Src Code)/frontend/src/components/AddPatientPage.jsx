import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './AddPatientModal.css';

const AddPatientPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    phone_number: '',
    patient_id: '',
    age: '',
    status: 'normal'
  });

  const [error, setError] = useState('');

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.name || !formData.phone_number || !formData.patient_id || !formData.age) {
      setError('Please fill in all fields');
      return;
    }

    // Convert the form data to match the Todo model expected by the backend
    const todoData = {
      name: formData.name,
      phone_number: formData.phone_number,
      unique_id: parseInt(formData.patient_id), // Convert to integer for Todo model
      age: parseInt(formData.age),              // Convert to integer for Todo model
      status: formData.status || 'normal'
    };

    try {
      const response = await fetch('http://localhost:8000/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(todoData)
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to add patient');
      }

      // Successfully added
      navigate('/');
    } catch (error) {
      setError(typeof error === 'string' ? error : error.message);
      console.error('Error:', error);
    }
  };

  return (
    <div className="add-patient-page">
      <div className="modal-content">
        <h2>Add New Patient</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Patient Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter patient name"
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label htmlFor="phone_number">Phone Number</label>
            <input
              type="tel"
              id="phone_number"
              name="phone_number"
              value={formData.phone_number}
              onChange={handleChange}
              placeholder="Enter phone number"
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label htmlFor="patient_id">Patient ID</label>
            <input
              type="text"
              id="patient_id"
              name="patient_id"
              value={formData.patient_id}
              onChange={handleChange}
              placeholder="Enter patient ID"
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label htmlFor="age">Age</label>
            <input
              type="text" // Changed to text to match backend expectation
              id="age"
              name="age"
              value={formData.age}
              onChange={handleChange}
              placeholder="Enter age"
              autoComplete="off"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button 
              type="button" 
              className="cancel-btn" 
              onClick={() => navigate('/')}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="submit-btn"
            >
              Add Patient
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddPatientPage;
