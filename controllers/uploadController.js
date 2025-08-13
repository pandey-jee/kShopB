import path from 'path';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// @desc    Upload single image
// @route   POST /api/upload/single
// @access  Private
export const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Upload to Cloudinary if configured, otherwise use local storage
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'panditji-auto-connect/products',
          transformation: [
            { width: 800, height: 800, crop: 'limit' },
            { quality: 'auto' }
          ]
        });

        res.json({
          success: true,
          message: 'Image uploaded successfully to Cloudinary',
          data: {
            url: result.secure_url,
            public_id: result.public_id,
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size
          }
        });
      } catch (cloudinaryError) {
        console.error('Cloudinary upload error:', cloudinaryError);
        // Fallback to local storage
        const fileUrl = `/uploads/${req.file.filename}`;
        res.json({
          success: true,
          message: 'Image uploaded successfully (local storage)',
          data: {
            url: fileUrl,
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size
          }
        });
      }
    } else {
      // Local storage fallback
      const fileUrl = `/uploads/${req.file.filename}`;
      res.json({
        success: true,
        message: 'Image uploaded successfully (local storage)',
        data: {
          url: fileUrl,
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size
        }
      });
    }
  } catch (error) {
    console.error('Upload image error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while uploading image'
    });
  }
};

// @desc    Upload multiple images
// @route   POST /api/upload/multiple
// @access  Private
export const uploadMultipleImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const uploadedFiles = [];

    // Upload to Cloudinary if configured
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
      try {
        for (const file of req.files) {
          const result = await cloudinary.uploader.upload(file.path, {
            folder: 'panditji-auto-connect/products',
            transformation: [
              { width: 800, height: 800, crop: 'limit' },
              { quality: 'auto' }
            ]
          });

          uploadedFiles.push({
            url: result.secure_url,
            public_id: result.public_id,
            filename: file.filename,
            originalName: file.originalname,
            size: file.size
          });
        }
      } catch (cloudinaryError) {
        console.error('Cloudinary upload error:', cloudinaryError);
        // Fallback to local storage
        req.files.forEach(file => {
          uploadedFiles.push({
            url: `/uploads/${file.filename}`,
            filename: file.filename,
            originalName: file.originalname,
            size: file.size
          });
        });
      }
    } else {
      // Local storage fallback
      req.files.forEach(file => {
        uploadedFiles.push({
          url: `/uploads/${file.filename}`,
          filename: file.filename,
          originalName: file.originalname,
          size: file.size
        });
      });
    }

    res.json({
      success: true,
      message: 'Images uploaded successfully',
      data: uploadedFiles
    });
  } catch (error) {
    console.error('Upload multiple images error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while uploading images'
    });
  }
};
