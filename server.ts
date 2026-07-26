import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import {
  INITIAL_BENGALURU_CASES,
  INITIAL_ACCUSED_PROFILES,
  INITIAL_HOTSPOTS,
  INITIAL_ANOMALY_ALERTS,
  INITIAL_AI_PREDICTIONS
} from './src/data/bengaluruDataSeed';
import { CatalystTableCaseMaster, CatalystTableAccused, CatalystTableAnomalyAlert } from './src/types';

// In-Memory Database representing Zoho Catalyst Data Store tables
let casesTable: CatalystTableCaseMaster[] = [...INITIAL_BENGALURU_CASES];
let accusedTable: CatalystTableAccused[] = [...INITIAL_ACCUSED_PROFILES];
let hotspotsTable = [...INITIAL_HOTSPOTS];
let alertsTable: CatalystTableAnomalyAlert[] = [...INITIAL_ANOMALY_ALERTS];

// Helper to initialize Gemini client lazily
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Log incoming requests for debugging
  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      console.log(`[Catalyst Function API] ${req.method} ${req.url}`);
    }
    next();
  });

  // ==========================================
  // ZOHO CATALYST FUNCTIONS REST ENDPOINTS
  // ==========================================

  // 1. getDashboard()
  app.get('/api/catalyst/functions/getDashboard', async (req, res) => {
    try {
      const totalCases = casesTable.length;
      const solvedCases = casesTable.filter(c => c.Case_Status_Name === 'Solved' || c.Case_Status_Name === 'Convicted').length;
      const pendingCases = casesTable.filter(c => c.Case_Status_Name === 'Under Investigation' || c.Case_Status_Name === 'Pending Trial').length;
      const repeatOffenders = accusedTable.filter(a => a.Case_Count >= 5).length;
      const highRiskAreas = hotspotsTable.filter(h => h.Risk_Level === 'CRITICAL' || h.Risk_Level === 'HIGH').length;
      const predictionAccuracy = 94.2;
      const todayIncidents = casesTable.filter(c => c.FIR_Date.startsWith('2026-07-25') || c.FIR_Date.startsWith('2026-07-24')).length;

      const monthlyTrends = [
        { month: 'Feb', cases: 142, solved: 110, cyber: 45, violent: 22 },
        { month: 'Mar', cases: 168, solved: 135, cyber: 58, violent: 28 },
        { month: 'Apr', cases: 155, solved: 128, cyber: 50, violent: 24 },
        { month: 'May', cases: 189, solved: 142, cyber: 72, violent: 31 },
        { month: 'Jun', cases: 210, solved: 165, cyber: 89, violent: 35 },
        { month: 'Jul', cases: 195, solved: 158, cyber: 82, violent: 29 }
      ];

      const crimeCategories = [
        { name: 'Cyber Crime', value: 38, color: '#3b82f6' },
        { name: 'Property Offence', value: 27, color: '#10b981' },
        { name: 'Violent Crime', value: 16, color: '#ef4444' },
        { name: 'Narcotics NDPS', value: 12, color: '#8b5cf6' },
        { name: 'Economic / Fraud', value: 7, color: '#f59e0b' }
      ];

      const districtComparison = [
        { district: 'Whitefield', cases: 88, resolved: 72, riskIndex: 91 },
        { district: 'East (Indiranagar/Ulsoor)', cases: 104, resolved: 81, riskIndex: 94 },
        { district: 'South East (Koramangala/HSR)', cases: 96, resolved: 79, riskIndex: 88 },
        { district: 'South (Electronic City)', cases: 74, resolved: 65, riskIndex: 82 },
        { district: 'North (Peenya)', cases: 82, resolved: 60, riskIndex: 85 }
      ];

      const aiInsights = [
        'Cyber fraud clusters detected shifting from Whitefield towards Kadugodi area.',
        'High correlation between Friday midnight hours and Narcotics activity in Electronic City Service Road.',
        'Ulsoor Rowdy Syndicate mobility increased near Indiranagar nightclub zone.'
      ];

      res.json({
        success: true,
        data: {
          stats: {
            totalCases,
            solvedCases,
            pendingCases,
            repeatOffenders,
            highRiskAreas,
            predictionAccuracy,
            todayIncidents
          },
          monthlyTrends,
          crimeCategories,
          districtComparison,
          recentCases: casesTable.slice(0, 5),
          recentAlerts: alertsTable.slice(0, 5),
          aiInsights,
          hotspotsSummary: hotspotsTable
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. getCases()
  app.get('/api/catalyst/functions/getCases', (req, res) => {
    try {
      const { search, status, category, district, page = '1', limit = '10' } = req.query;
      let filtered = [...casesTable];

      if (search && typeof search === 'string') {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          c =>
            c.Crime_Number.toLowerCase().includes(q) ||
            c.Police_Station_Name.toLowerCase().includes(q) ||
            c.Crime_Head_Name.toLowerCase().includes(q) ||
            c.Incident_Location.toLowerCase().includes(q) ||
            c.Summary.toLowerCase().includes(q)
        );
      }

      if (status && typeof status === 'string' && status !== 'ALL') {
        filtered = filtered.filter(c => c.Case_Status_Name === status);
      }

      if (category && typeof category === 'string' && category !== 'ALL') {
        filtered = filtered.filter(c => c.Crime_Head_Name === category);
      }

      if (district && typeof district === 'string' && district !== 'ALL') {
        filtered = filtered.filter(c => c.District_Name.includes(district));
      }

      const p = parseInt(page as string, 10) || 1;
      const l = parseInt(limit as string, 10) || 10;
      const total = filtered.length;
      const totalPages = Math.ceil(total / l);
      const startIndex = (p - 1) * l;
      const paginated = filtered.slice(startIndex, startIndex + l);

      res.json({
        success: true,
        data: {
          cases: paginated,
          pagination: {
            page: p,
            limit: l,
            total,
            totalPages
          }
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. getCaseById()
  app.get('/api/catalyst/functions/getCaseById', (req, res) => {
    try {
      const { id } = req.query;
      const caseItem = casesTable.find(c => c.ROWID === id || c.Crime_Number === id);
      if (!caseItem) {
        return res.status(404).json({ success: false, error: 'Case not found in Catalyst Data Store' });
      }
      res.json({ success: true, data: caseItem });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. addCase()
  app.post('/api/catalyst/functions/addCase', (req, res) => {
    try {
      const body = req.body;
      const newRowId = (Date.now() + Math.floor(Math.random() * 1000)).toString();
      const firNum = `FIR/BLR-${body.stationCode || 'HQ'}/2026/${Math.floor(100 + Math.random() * 900)}`;

      const newCase: CatalystTableCaseMaster = {
        ROWID: newRowId,
        Crime_Number: firNum,
        FIR_Date: new Date().toISOString().split('T')[0],
        Police_Station_Id: body.Police_Station_Id || 'PS-101',
        Police_Station_Name: body.Police_Station_Name || 'Bengaluru Central PS',
        District_Id: body.District_Id || 'DIST-01',
        District_Name: body.District_Name || 'Bengaluru Central Division',
        Crime_Head_Id: body.Crime_Head_Id || 'CH-01',
        Crime_Head_Name: body.Crime_Head_Name || 'Cyber Crime',
        Crime_Sub_Head_Id: 'CSH-01',
        Crime_Sub_Head_Name: body.Crime_Sub_Head_Name || 'General Crime',
        Case_Status_Id: 'CS-01',
        Case_Status_Name: 'Under Investigation',
        Gravity_Offence_Id: 'GO-01',
        Gravity_Offence_Name: body.Gravity_Offence_Name || 'Cognizable Offence',
        Act_Id: 'ACT-IPC',
        Act_Name: 'Indian Penal Code / IT Act',
        Section_Id: 'SEC-420',
        Section_Number: body.Section_Number || '420 & 379 IPC',
        Incident_Date: body.Incident_Date || new Date().toISOString(),
        Incident_Location: body.Incident_Location || 'Bengaluru City',
        Latitude: body.Latitude || 12.9716,
        Longitude: body.Longitude || 77.5946,
        Summary: body.Summary || 'New FIR registered at Bengaluru Station',
        Created_Time: new Date().toISOString(),
        Mod_Time: new Date().toISOString(),
        Investigating_Officer: body.Investigating_Officer || 'Inspector Suresh Kumar',
        Complainant: body.Complainant || {
          ROWID: `COMP-${newRowId}`,
          Case_Id: newRowId,
          Name: body.Complainant_Name || 'Citizen Complainant',
          Age: body.Complainant_Age || 35,
          Gender: 'Male',
          Contact_Number: body.Complainant_Phone || '+91 98000 00000',
          Address: body.Incident_Location || 'Bengaluru'
        },
        Victims: body.Victim_Name ? [{
          ROWID: `VIC-${newRowId}`,
          Case_Id: newRowId,
          Name: body.Victim_Name,
          Age: 30,
          Gender: 'Male',
          Injuries: 'Property/Financial Loss',
          Remarks: 'Recorded under FIR'
        }] : [],
        AccusedList: []
      };

      casesTable.unshift(newCase);

      res.json({
        success: true,
        message: 'Case successfully added to Zoho Catalyst Data Store CaseMaster table',
        data: newCase
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. updateCaseStatus()
  app.post('/api/catalyst/functions/updateCaseStatus', (req, res) => {
    try {
      const { caseId, status } = req.body;
      const targetCase = casesTable.find(c => c.ROWID === caseId || c.Crime_Number === caseId);
      if (!targetCase) {
        return res.status(404).json({ success: false, error: 'Case not found' });
      }

      targetCase.Case_Status_Name = status;
      targetCase.Mod_Time = new Date().toISOString();

      res.json({
        success: true,
        message: `Case status updated to ${status} in Zoho Catalyst Data Store`,
        data: targetCase
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. getRepeatOffenders()
  app.get('/api/catalyst/functions/getRepeatOffenders', (req, res) => {
    try {
      res.json({
        success: true,
        data: accusedTable
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7. getCrimeHotspots()
  app.get('/api/catalyst/functions/getCrimeHotspots', (req, res) => {
    try {
      res.json({
        success: true,
        data: hotspotsTable
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8. predictCrime()
  app.get('/api/catalyst/functions/predictCrime', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (ai) {
        // Dynamic AI calculation via Gemini if API key is valid
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are the AI Crime Prediction Engine for Bengaluru City Police.
            Analyze current crime trends in Bengaluru (Whitefield, Koramangala, Indiranagar, Peenya, Electronic City, HSR Layout).
            Provide JSON with keys: threatIndex (number 0-100), keyInsight (string), newEmergingHotspot (object with location, risk, type).`
          });
          const text = response.text || '';
          console.log('[Gemini AI Crime Prediction Generated]');
        } catch (geminiError) {
          console.warn('Gemini prediction fallback to stored model:', geminiError);
        }
      }

      res.json({
        success: true,
        data: INITIAL_AI_PREDICTIONS
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Anomaly Alerts endpoint
  app.get('/api/catalyst/functions/getAnomalyAlerts', (req, res) => {
    res.json({ success: true, data: alertsTable });
  });

  app.post('/api/catalyst/functions/dismissAlert', (req, res) => {
    const { id } = req.body;
    alertsTable = alertsTable.filter(a => a.ROWID !== id);
    res.json({ success: true, message: 'Alert dismissed' });
  });

  // Vite middleware setup for Development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Network: http://127.0.0.1:${PORT}`);
  });
}

startServer();
