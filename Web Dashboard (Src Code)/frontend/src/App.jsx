import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import PatientDetail from './components/PatientDetail';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/patient/:id" element={<PatientDetail />} />
        {/* other routes */}
    </Router>
  );
}

export default App;