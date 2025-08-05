require('dotenv').config(); // Load environment variables

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Postgres DB Pool from environment variable DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create sessions table if not exists
async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      symptomsText TEXT NOT NULL,
      imagePath TEXT,
      possibleCauses TEXT,
      riskLevel TEXT,
      selfCareTips TEXT,
      doctorAdvice TEXT,
      timestamp BIGINT
    )
  `);
}
createTables().catch(console.error);

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Dummy AI health logic
function generateDummyAIResponse(symptomsText) {
  let possibleCauses = 'Unknown';
  let riskLevel = 'Moderate';
  let selfCareTips = 'Rest and drink plenty of fluids.';
  let doctorAdvice = 'Consult a doctor if symptoms worsen.';

  const lower = symptomsText.toLowerCase();

  if (lower.includes('fever')) {
    possibleCauses = 'Common cold, Influenza, COVID-19';
    riskLevel = 'Mild to Moderate';
    selfCareTips = 'Take paracetamol, rest and stay hydrated.';
    doctorAdvice = 'Seek medical advice if fever persists beyond 3 days.';
  } else if (lower.includes('headache')) {
    possibleCauses = 'Tension headache, Migraine';
    riskLevel = 'Mild';
    selfCareTips = 'Rest in a quiet, dark room; avoid stress.';
    doctorAdvice = 'See a doctor if headaches are severe or recurrent.';
  } else if (lower.includes('chest pain')) {
    possibleCauses = 'Angina, Heart attack, Acid reflux';
    riskLevel = 'High';
    selfCareTips = 'Seek emergency care immediately.';
    doctorAdvice = 'Call emergency services or visit the nearest hospital.';
  }
  return { possibleCauses, riskLevel, selfCareTips, doctorAdvice };
}

// Save uploaded base64 image locally
async function saveImage(base64Image) {
  if (!base64Image) return null;
  const matches = base64Image.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid base64 image format');
  const ext = matches[1].split('/')[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const filename = `${uuidv4()}.${ext}`;
  const filepath = path.join(uploadsDir, filename);
  await fs.promises.writeFile(filepath, buffer);
  return `/uploads/${filename}`;
}

// Chat API
app.post('/api/chat', async (req, res) => {
  try {
    const { symptomsText, base64Image } = req.body;
    if (!symptomsText) return res.status(400).json({ error: 'symptomsText is required' });
    const imagePath = await saveImage(base64Image);
    const aiResponse = generateDummyAIResponse(symptomsText);
    const sessionId = uuidv4();
    const timestamp = Date.now();

    await pool.query(
      `INSERT INTO sessions (id, symptomsText, imagePath, possibleCauses, riskLevel, selfCareTips, doctorAdvice, timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [sessionId, symptomsText, imagePath, aiResponse.possibleCauses, aiResponse.riskLevel, aiResponse.selfCareTips, aiResponse.doctorAdvice, timestamp]
    );

    res.json({ sessionId, symptomsText, imageUrl: imagePath, aiResponse, timestamp });
  } catch (err) {
    console.error('Chat API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PDF generation API
app.post('/api/generate-pdf', async (req, res) => {
  try {
    const { symptomsText, aiResponse, imageUrl, timestamp } = req.body;
    const doc = new PDFDocument();
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment;filename=Health_Report.pdf',
        'Content-Length': pdfData.length,
      });
      res.end(pdfData);
    });

    doc.fontSize(20).text('AI-Doctor Health Report', { align: 'center' }).moveDown();
    doc.fontSize(12).text(`Date: ${timestamp ? new Date(timestamp).toLocaleString() : new Date().toLocaleString()}`, { align: 'right' }).moveDown();
    doc.fontSize(14).text('Symptoms:', { underline: true });
    doc.fontSize(12).text(symptomsText).moveDown();

    doc.fontSize(14).text('AI-Doctor Response:', { underline: true });
    doc.fontSize(12).list([
      `Possible Causes: ${aiResponse.possibleCauses}`,
      `Risk Level: ${aiResponse.riskLevel}`,
      `Self-Care Tips: ${aiResponse.selfCareTips}`,
      `Doctor Advice: ${aiResponse.doctorAdvice}`,
    ]);
    doc.moveDown();

    if (imageUrl) {
      try {
        const localPath = path.join(__dirname, imageUrl.replace(/^(http:\/\/[^\/]+)?/, ''));
        if (fs.existsSync(localPath)) {
          doc.addPage().fontSize(16).text('Symptom Image:', { underline: true });
          doc.image(localPath, { fit: [400, 400], align: 'center' });
        } else {
          doc.text('Symptom image not found.');
        }
      } catch {
        doc.text('Error loading symptom image.');
      }
    }

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running at http://localhost:${PORT}`));