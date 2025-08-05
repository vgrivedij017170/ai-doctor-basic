import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './index.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.3/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.3/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.3/images/marker-shadow.png',
});

function ChangeView({ center }) {
  const map = useMap();
  map.setView(center, 13);
  return null;
}

const API_BASE = process.env.REACT_APP_API_URL || 'https://ai-doctor-basic.onrender.com/';

function App() {
  const [symptomsText, setSymptomsText] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [aiResponse, setAiResponse] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);

  const [userLocation, setUserLocation] = useState(null);
  const [hospitals, setHospitals] = useState([]);

  const fileInputRef = useRef();

  useEffect(() => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported, default to NYC');
      setUserLocation({ lat: 40.7128, lng: -74.006 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        alert('Location denied, default to NYC');
        setUserLocation({ lat: 40.7128, lng: -74.006 });
      }
    );
  }, []);

  useEffect(() => {
    if (!userLocation) return;

    async function fetchHospitals() {
      const { lat, lng } = userLocation;
      const viewbox = `${lng - 0.03},${lat - 0.03},${lng + 0.03},${lat + 0.03}`;
      const url = 'https://nominatim.openstreetmap.org/search?' +
        new URLSearchParams({
          q: 'hospital',
          format: 'json',
          limit: '20',
          viewbox,
          bounded: '1',
          addressdetails: '1',
        }).toString();

      try {
        const resp = await fetch(url, {
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'ai-doctor-demo/1.0 (your.email@example.com)'
          }
        });
        if (!resp.ok) throw new Error('Nominatim error');
        const data = await resp.json();
        setHospitals(data);
      } catch (e) {
        console.error(e);
        setHospitals([]);
      }
    }
    fetchHospitals();
  }, [userLocation]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result);
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setSymptomsText('');
    setSelectedImage(null);
    setImagePreview(null);
    setAiResponse(null);
    setSessionId(null);
  };

  const handleSubmit = async () => {
    if (!symptomsText.trim()) {
      alert('Enter your symptoms');
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptomsText, base64Image: selectedImage }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setAiResponse(data.aiResponse);
        setSessionId(data.sessionId);
        setImagePreview(data.imageUrl ? `${API_BASE}${data.imageUrl}` : null);
      } else {
        alert(data.error || 'AI response failed');
      }
    } catch (e) {
      alert('Server error: ' + e.message);
    }
    setLoading(false);
  };

  const downloadPdf = async () => {
    if (!sessionId || !aiResponse) {
      alert('Submit symptoms first');
      return;
    }
    const body = { symptomsText, aiResponse, imageUrl: imagePreview, timestamp: new Date().toISOString() };
    try {
      const resp = await fetch(`${API_BASE}/api/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error('PDF generation failed');
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Health_Report.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Download failed: ' + err.message);
    }
  };

  return (
    <div className="app-container">
      <header className="header-bar">
        <h1 className="site-title">AI-Doctor: Virtual Health Advisor</h1>
      </header>
      <main className="main-content">
        <section className="map-section">
          {userLocation ? (
            <MapContainer center={userLocation} zoom={13} scrollWheelZoom style={{ height: '100%', borderRadius: 8 }}>
              <ChangeView center={userLocation} />
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker position={userLocation}>
                <Popup>You are here</Popup>
              </Marker>
              {hospitals.map((hospital) => (
                <Marker key={hospital.place_id} position={[hospital.lat, hospital.lon]}>
                  <Popup>
                    <b>{hospital.display_name}</b>
                    <br />
                    {hospital.address && (
                      <>
                        {hospital.address.road ? hospital.address.road + ', ' : ''}
                        {hospital.address.city ? hospital.address.city + ', ' : ''}
                        {hospital.address.state ? hospital.address.state : ''}
                      </>
                    )}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          ) : (
            <p>Locating you...</p>
          )}
        </section>

        <section className="chat-section">
          <textarea
            className="symptom-input"
            placeholder="Enter your symptoms here (e.g. 'I have fever and headache for 2 days')"
            value={symptomsText}
            onChange={(e) => setSymptomsText(e.target.value)}
            rows={5}
            disabled={loading}
          />

          <label htmlFor="imageUpload" className="upload-label">
            Upload symptom image (optional):
          </label>
          <input id="imageUpload" type="file" accept="image/*" onChange={handleImageChange} disabled={loading} ref={fileInputRef} />
          {imagePreview && <img src={imagePreview} alt="Symptom preview" className="image-preview" />}

          <button disabled={loading} onClick={handleSubmit} className="primary-btn">
            {loading ? 'Processing...' : 'Get Health Advice'}
          </button>

          {aiResponse && (
            <div className="ai-response">
              <h2>AI-Doctor Advice:</h2>
              <p>
                <strong>Possible Causes:</strong> {aiResponse.possibleCauses}
              </p>
              <p>
                <strong>Risk Level:</strong> {aiResponse.riskLevel}
              </p>
              <p>
                <strong>Self-Care Tips:</strong> {aiResponse.selfCareTips}
              </p>
              <p>
                <strong>Doctor Advice:</strong> {aiResponse.doctorAdvice}
              </p>
              <button onClick={downloadPdf} className="primary-btn">
                Download Health Report (PDF)
              </button>
            </div>
          )}

          {(aiResponse || loading) && (
            <button onClick={resetForm} className="secondary-btn">
              Another Query
            </button>
          )}
        </section>
      </main>
      <footer className="footer bg-gray-900 text-white text-sm text-center py-4 px-2">
        <p><strong>Scrum ID: PRJ25-26/G-13</strong></p>
        <p><strong>Team Name: Maverick</strong></p>
        <p><strong>Scrum Master: Aryan Khan(PIET22AD001)</strong></p>
        <p><strong>Members: Gourav Trivedi (PIET22AD020), Harish Geela (PIET22AD021)</strong></p>
      </footer>

    </div>
  );
}

export default App;