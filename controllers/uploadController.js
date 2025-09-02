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

    // Upload to Cloudinary if configured
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      try {
        // Upload from buffer (memory storage)
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'panditji-auto-connect/products',
            transformation: [
              { width: 800, height: 800, crop: 'limit' },
              { quality: 'auto' }
            ],
            resource_type: 'auto'
          },
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error);
              return res.status(500).json({
                success: false,
                message: 'Failed to upload image to Cloudinary'
              });
            }

            res.json({
              success: true,
              message: 'Image uploaded successfully to Cloudinary',
              data: {
                url: result.secure_url,
                public_id: result.public_id,
                filename: req.file.originalname,
                originalName: req.file.originalname,
                size: req.file.size
              }
            });
          }
        );

        // Upload the buffer
        uploadStream.end(req.file.buffer);
      } catch (cloudinaryError) {
        console.error('Cloudinary upload error:', cloudinaryError);
        res.status(500).json({
          success: false,
          message: 'Failed to upload image to Cloudinary'
        });
      }
    } else {
      // No Cloudinary configuration found
      res.status(500).json({
        success: false,
        message: 'Cloudinary configuration missing'
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
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      try {
        const uploadPromises = req.files.map(file => {
          return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: 'panditji-auto-connect/products',
                transformation: [
                  { width: 800, height: 800, crop: 'limit' },
                  { quality: 'auto' }
                ],
                resource_type: 'auto'
              },
              (error, result) => {
                if (error) {
                  reject(error);
                } else {
                  resolve({
                    url: result.secure_url,
                    public_id: result.public_id,
                    filename: file.originalname,
                    originalName: file.originalname,
                    size: file.size
                  });
                }
              }
            );
            uploadStream.end(file.buffer);
          });
        });

        const results = await Promise.all(uploadPromises);
        uploadedFiles.push(...results);
      } catch (cloudinaryError) {
        console.error('Cloudinary upload error:', cloudinaryError);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload images to Cloudinary'
        });
      }
    } else {
      return res.status(500).json({
        success: false,
        message: 'Cloudinary configuration missing'
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

// @desc    Get all uploaded files
// @route   GET /api/uploads
// @access  Private/Admin
export const getUploads = async (req, res) => {
  try {
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
      const result = await cloudinary.api.resources({
        type: 'upload',
        prefix: 'panditji-auto-connect/',
        max_results: 100
      });

      const files = result.resources.map(resource => ({
        _id: resource.public_id,
        originalName: resource.public_id.split('/').pop(),
        filename: resource.public_id,
        mimetype: `image/${resource.format}`,
        size: resource.bytes,
        url: resource.secure_url,
        uploadedBy: 'admin',
        uploadedAt: resource.created_at,
        category: 'product'
      }));

      res.json(files);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error fetching uploads:', error);
    res.status(500).json({ message: 'Failed to fetch uploads' });
  }
};

// @desc    Delete uploaded file
// @route   DELETE /api/uploads/:fileId
// @access  Private/Admin
export const deleteUpload = async (req, res) => {
  try {
    const { fileId } = req.params;

    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
      await cloudinary.uploader.destroy(fileId);
    }

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ message: 'Failed to delete file' });
  }
};

// @desc    Get upload statistics
// @route   GET /api/uploads/stats
// @access  Private/Admin
export const getUploadStats = async (req, res) => {
  try {
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
      const result = await cloudinary.api.resources({
        type: 'upload',
        prefix: 'panditji-auto-connect/',
        max_results: 500
      });

      const totalFiles = result.resources.length;
      const totalSize = result.resources.reduce((sum, resource) => sum + resource.bytes, 0);
      
      const fileTypes = result.resources.reduce((acc, resource) => {
        const format = resource.format;
        acc[format] = (acc[format] || 0) + 1;
        return acc;
      }, {});

      res.json({
        totalFiles,
        totalSize,
        fileTypes,
        recentFiles: result.resources.slice(0, 5)
      });
    } else {
      res.json({
        totalFiles: 0,
        totalSize: 0,
        fileTypes: {},
        recentFiles: []
      });
    }
  } catch (error) {
    console.error('Error fetching upload stats:', error);
    res.status(500).json({ message: 'Failed to fetch upload statistics' });
  }
};

// @desc    Get all uploaded files
// @route   GET /api/uploads
// @access  Private/Admin
export const getUploadedFiles = async (req, res) => {
  try {
    // Get files from Cloudinary
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
      const result = await cloudinary.search
        .expression('folder:panditji-auto-connect/*')
        .sort_by([['created_at', 'desc']])
        .max_results(100)
        .execute();

      const files = result.resources.map(file => ({
        id: file.public_id,
        name: file.filename || file.public_id.split('/').pop(),
        url: file.secure_url,
        size: file.bytes,
        format: file.format,
        uploadedAt: file.created_at,
        folder: file.folder,
        type: file.resource_type
      }));

      return res.json({
        success: true,
        files,
        total: result.total_count
      });
    }

    // Fallback to local files (if no Cloudinary)
    res.json({
      success: true,
      files: [],
      total: 0,
      message: 'No cloud storage configured'
    });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch uploaded files'
    });
  }
};
