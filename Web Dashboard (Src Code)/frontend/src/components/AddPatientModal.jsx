import React, { useState, useCallback } from 'react';
import './AddPatientModal.css';

const AddPatientModal = ({ isOpen, onClose, onAdd }) => {
  const [formData, setFormData] = useState({
    name: '',
    phone_number: '',
    patient_id: '',
    age: '',
    status: 'normal'
  });

  const [error, setError] = useState('');

  // Use useCallback to memoize the handler
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

    // Basic validation
    if (!formData.name || !formData.phone_number || !formData.patient_id || !formData.age) {
      setError('Please fill in all fields');
      return;
    }

    try {
      const response = await fetch('http://localhost:8000/api/patients/', {  // Updated endpoint
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to add patient');
      }

      const data = await response.json();
      onAdd(data);
      onClose();
      // Only reset form after successful submission
      setFormData({
        name: '',
        phone_number: '',
        patient_id: '',
        age: '',
        status: 'normal'
      });
    } catch (error) {
      setError('Failed to add patient. Please try again.');
      console.error('Error:', error);
    }
  };

  // If modal is not open, don't render anything
  if (!isOpen) return null;

  return (
    <div 
      className="modal-overlay" 
      onClick={(e) => {
        // Only close if clicking the overlay itself
        if (e.target.className === 'modal-overlay') onClose();
      }}
    >
      <div className="modal-content" onClick={e => e.stopPropagation()}>
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
              type="number"
              id="age"
              name="age"
              value={formData.age}
              onChange={handleChange}
              placeholder="Enter age"
              autoComplete="off"
              min="0"
              max="150"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button 
              type="button" 
              className="cancel-btn" 
              onClick={onClose}
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

export default AddPatientModal;
