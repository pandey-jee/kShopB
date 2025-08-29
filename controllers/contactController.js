import nodemailer from 'nodemailer';

// Create contact submission
export const submitContactForm = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and message are required'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Create transporter
    const transporter = nodemailer.createTransporter({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Email to admin
    const adminMailOptions = {
      from: process.env.EMAIL_USER,
      to: 'admin@panditjiautoconnect.com', // Your business email
      subject: `New Contact Form Submission: ${subject || 'General Inquiry'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">
            New Contact Form Submission
          </h2>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
            <p><strong>Subject:</strong> ${subject || 'General Inquiry'}</p>
          </div>
          
          <div style="margin: 20px 0;">
            <h3 style="color: #333;">Message:</h3>
            <div style="background-color: #fff; border: 1px solid #dee2e6; padding: 15px; border-radius: 5px;">
              ${message.replace(/\n/g, '<br>')}
            </div>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #666; font-size: 14px;">
            <p>This message was sent from the Panditji Auto Connect contact form.</p>
            <p>Please respond promptly to maintain customer satisfaction.</p>
          </div>
        </div>
      `
    };

    // Auto-reply to customer
    const customerMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Thank you for contacting Panditji Auto Connect',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #007bff; color: white; padding: 20px; text-align: center;">
            <h1>Panditji Auto Connect</h1>
            <p>Premium Auto Parts & Accessories</p>
          </div>
          
          <div style="padding: 30px 20px;">
            <h2 style="color: #333;">Thank You for Your Message!</h2>
            
            <p>Dear ${name},</p>
            
            <p>We have received your message and our team will get back to you within 24 hours. Here's a summary of your inquiry:</p>
            
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Subject:</strong> ${subject || 'General Inquiry'}</p>
              <p><strong>Message:</strong> ${message.substring(0, 100)}...</p>
            </div>
            
            <p>In the meantime, feel free to:</p>
            <ul>
              <li>Browse our <a href="https://panditjiautoconnect.com/products">latest products</a></li>
              <li>Check our <a href="https://panditjiautoconnect.com/faq">FAQ section</a></li>
              <li>Follow us on social media for updates</li>
            </ul>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
              <p><strong>Contact Information:</strong></p>
              <p>📧 Email: support@panditjiautoconnect.com</p>
              <p>📞 Phone: +91-XXXXXXXXXX</p>
              <p>⏰ Business Hours: Monday to Saturday, 9 AM - 7 PM</p>
            </div>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666;">
            <p>Thank you for choosing Panditji Auto Connect!</p>
            <p style="font-size: 14px;">This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      `
    };

    // Send emails
    await Promise.all([
      transporter.sendMail(adminMailOptions),
      transporter.sendMail(customerMailOptions)
    ]);

    res.status(200).json({
      success: true,
      message: 'Message sent successfully! We will get back to you within 24 hours.'
    });

  } catch (error) {
    console.error('Contact form submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message. Please try again or contact us directly.'
    });
  }
};

// Get contact information
export const getContactInfo = async (req, res) => {
  try {
    const contactInfo = {
      email: 'support@panditjiautoconnect.com',
      phone: '+91-XXXXXXXXXX',
      address: {
        street: 'Shop No. 123, Auto Parts Market',
        city: 'New Delhi',
        state: 'Delhi',
        zipCode: '110001',
        country: 'India'
      },
      businessHours: {
        monday: '9:00 AM - 7:00 PM',
        tuesday: '9:00 AM - 7:00 PM',
        wednesday: '9:00 AM - 7:00 PM',
        thursday: '9:00 AM - 7:00 PM',
        friday: '9:00 AM - 7:00 PM',
        saturday: '9:00 AM - 7:00 PM',
        sunday: 'Closed'
      },
      socialMedia: {
        facebook: 'https://facebook.com/panditjiautoconnect',
        instagram: 'https://instagram.com/panditjiautoconnect',
        twitter: 'https://twitter.com/panditjiauto',
        youtube: 'https://youtube.com/panditjiautoconnect'
      }
    };

    res.status(200).json({
      success: true,
      data: contactInfo
    });
  } catch (error) {
    console.error('Get contact info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contact information'
    });
  }
};
