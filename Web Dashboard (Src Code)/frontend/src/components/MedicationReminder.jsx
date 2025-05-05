import React, { useState, useEffect, useCallback } from 'react';
import './MedicationReminder.css';

const MedicationReminder = ({ patientId }) => {
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMedication, setNewMedication] = useState({
    name: '',
    dosage: '',
    frequency: 'daily',
    time: '',
    notes: ''
  });

  // Fetch medications
  const fetchMedications = useCallback(async () => {
    if (!patientId) return;
    
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:8000/patient/${patientId}/medications`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch medications');
      }
      
      const data = await response.json();
      setMedications(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching medications:', err);
      setError('Failed to load medications. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  // Load medications on component mount
  useEffect(() => {
    fetchMedications();
  }, [fetchMedications]);

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewMedication(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Add a new medication
  const handleAddMedication = async (e) => {
    e.preventDefault();
    
    try {
      const response = await fetch(`http://localhost:8000/patient/${patientId}/medications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newMedication),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add medication');
      }
      
      // Reset form and refresh medications
      setNewMedication({
        name: '',
        dosage: '',
        frequency: 'daily',
        time: '',
        notes: ''
      });
      setShowAddForm(false);
      fetchMedications();
    } catch (err) {
      console.error('Error adding medication:', err);
      setError('Failed to add medication. Please try again.');
    }
  };

  // Delete a medication
  const handleDeleteMedication = async (index) => {
    try {
      const response = await fetch(`http://localhost:8000/patient/${patientId}/medications/${index}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete medication');
      }
      
      // Refresh medications after delete
      fetchMedications();
    } catch (err) {
      console.error('Error deleting medication:', err);
      setError('Failed to delete medication. Please try again.');
    }
  };

  // Format time from 24-hour to 12-hour format
  const formatTime = (time) => {
    if (!time) return '';
    
    try {
      const [hours, minutes] = time.split(':');
      const hour = parseInt(hours, 10);
      const suffix = hour >= 12 ? 'PM' : 'AM';
      const formattedHour = hour % 12 || 12;
      return `${formattedHour}:${minutes} ${suffix}`;
    } catch (err) {
      console.error('Error formatting time:', err);
      return time;
    }
  };

  // Determine next upcoming dose
  const getNextDose = (medication) => {
    if (!medication.time) return 'Not scheduled';
    
    const now = new Date();
    const [hours, minutes] = medication.time.split(':');
    const doseTime = new Date();
    doseTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    
    // If the dose time for today has passed, schedule for tomorrow
    if (doseTime < now) {
      doseTime.setDate(doseTime.getDate() + 1);
    }
    
    // Calculate time difference
    const diffMs = doseTime - now;
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHrs === 0) {
      return diffMins === 0 ? 'Due now' : `In ${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
    } else if (diffHrs < 24) {
      return `In ${diffHrs} hour${diffHrs !== 1 ? 's' : ''} ${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
    } else {
      return `Tomorrow at ${formatTime(medication.time)}`;
    }
  };

  return (
    <div className="medication-reminder">
      <div className="section-header">
        <h2>Medication Reminder</h2>
        <button 
          className="add-medication-btn"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Cancel' : '+ Add Medication'}
        </button>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      {showAddForm && (
        <div className="add-medication-form">
          <h3>Add New Medication</h3>
          <form onSubmit={handleAddMedication}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">Medication Name*</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={newMedication.name}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter medication name"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="dosage">Dosage*</label>
                <input
                  type="text"
                  id="dosage"
                  name="dosage"
                  value={newMedication.dosage}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g., 1 tablet, 5ml"
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="frequency">Frequency*</label>
                <select
                  id="frequency"
                  name="frequency"
                  value={newMedication.frequency}
                  onChange={handleInputChange}
                  required
                >
                  <option value="daily">Daily</option>
                  <option value="twice_daily">Twice Daily</option>
                  <option value="three_times_daily">Three Times Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="as_needed">As Needed</option>
                </select>
              </div>
              
              <div className="form-group">
                <label htmlFor="time">Time*</label>
                <input
                  type="time"
                  id="time"
                  name="time"
                  value={newMedication.time}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>
            
            <div className="form-group full-width">
              <label htmlFor="notes">Notes (Optional)</label>
              <textarea
                id="notes"
                name="notes"
                value={newMedication.notes}
                onChange={handleInputChange}
                placeholder="Additional instructions or notes"
                rows="2"
              />
            </div>
            
            <div className="form-actions">
              <button type="submit" className="submit-btn">Add Medication</button>
              <button 
                type="button" 
                className="cancel-btn"
                onClick={() => setShowAddForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      
      {loading ? (
        <div className="loading-message">Loading medications...</div>
      ) : medications.length === 0 ? (
        <div className="empty-state">
          <p>No medications have been added for this patient.</p>
          <button 
            className="add-first-medication-btn"
            onClick={() => setShowAddForm(true)}
          >
            Add First Medication
          </button>
        </div>
      ) : (
        <div className="medications-list">
          {medications.map((medication, index) => (
            <div key={index} className="medication-card">
              <div className="medication-info">
                <h3 className="medication-name">{medication.name}</h3>
                <div className="medication-details">
                  <div className="detail-item">
                    <span className="label">Dosage:</span>
                    <span className="value">{medication.dosage}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Frequency:</span>
                    <span className="value">{medication.frequency.replace('_', ' ')}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Time:</span>
                    <span className="value">{formatTime(medication.time)}</span>
                  </div>
                  {medication.notes && (
                    <div className="detail-item notes">
                      <span className="label">Notes:</span>
                      <span className="value">{medication.notes}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="medication-status">
                <div className="next-dose">
                  <span className="label">Next dose:</span>
                  <span className="value">{getNextDose(medication)}</span>
                </div>
                <button
                  className="delete-btn"
                  onClick={() => handleDeleteMedication(index)}
                  aria-label="Delete medication"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MedicationReminder; 