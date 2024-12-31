import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Base uploads directory
const BASE_UPLOADS_DIR = path.join(__dirname, '../uploads');

// Ensure base uploads directory exists
if (!fs.existsSync(BASE_UPLOADS_DIR)) {
  fs.mkdirSync(BASE_UPLOADS_DIR, { recursive: true });
}

// Multer storage configuration with meeting-specific folders
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Get meetingId from request body or use 'default' if not provided
    const meetingId = req.body.meetingId || 'default';
    
    // Create meeting-specific upload directory
    const meetingUploadDir = path.join(BASE_UPLOADS_DIR, meetingId);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(meetingUploadDir)) {
      fs.mkdirSync(meetingUploadDir, { recursive: true });
    }
    
    cb(null, meetingUploadDir);
  },
  filename: (req, file, cb) => {
    const meetingId = req.body.meetingId || 'default';
    const uniqueFileName = `${meetingId}_${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueFileName);
  }
});

// Multer upload configuration
const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 50 * 1024 * 1024 // 50MB file size limit
  }
});

// Static file serving for uploaded files
app.use('/uploads', express.static(BASE_UPLOADS_DIR));

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Generate public URL for the file
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${path.basename(req.file.destination)}/${req.file.filename}`;

    res.json({
      message: 'File uploaded successfully',
      fileName: req.file.filename,
      originalName: req.file.originalname,
      fileUrl: fileUrl,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      meetingId: path.basename(req.file.destination)
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

// File download endpoint
app.get('/api/download/:meetingId/:filename', (req, res) => {
  const filePath = path.join(BASE_UPLOADS_DIR, req.params.meetingId, req.params.filename);
  
  res.download(filePath, (err) => {
    if (err) {
      res.status(404).json({ error: 'File not found' });
    }
  });
});

// File deletion endpoint
app.delete('/api/files/:meetingId/:filename', (req, res) => {
  const filePath = path.join(BASE_UPLOADS_DIR, req.params.meetingId, req.params.filename);
  
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error('File deletion error:', err);
      return res.status(500).json({ error: 'Failed to delete file' });
    }
    res.json({ message: 'File deleted successfully' });
  });
});

// Optional: Cleanup endpoint to remove empty meeting folders
app.delete('/api/meeting-files/:meetingId', (req, res) => {
  const meetingUploadDir = path.join(BASE_UPLOADS_DIR, req.params.meetingId);
  
  fs.readdir(meetingUploadDir, (err, files) => {
    if (err) {
      return res.status(404).json({ error: 'Meeting directory not found' });
    }
    
    // Delete all files in the meeting directory
    const deletePromises = files.map(file => 
      new Promise((resolve, reject) => {
        fs.unlink(path.join(meetingUploadDir, file), (err) => {
          if (err) reject(err);
          else resolve(true);
        });
      })
    );
    
    Promise.all(deletePromises)
      .then(() => {
        // Remove the directory itself
        fs.rmdir(meetingUploadDir, (err) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to remove meeting directory' });
          }
          res.json({ message: 'All meeting files deleted successfully' });
        });
      })
      .catch(error => {
        res.status(500).json({ error: 'Failed to delete some files' });
      });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
