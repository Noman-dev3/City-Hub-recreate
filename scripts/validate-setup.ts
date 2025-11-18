// scripts/validate-setup.ts
/**
 * Run this script to validate your environment setup
 * Usage: npx ts-node scripts/validate-setup.ts
 */

import { google } from 'googleapis';

interface ValidationResult {
  step: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
}

const results: ValidationResult[] = [];

function addResult(step: string, status: 'pass' | 'fail' | 'warning', message: string) {
  results.push({ step, status, message });
}

function printResults() {
  console.log('\n=== Setup Validation Results ===\n');
  
  results.forEach((result) => {
    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
    console.log(`${icon} ${result.step}`);
    console.log(`   ${result.message}\n`);
  });

  const failures = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warning').length;
  const passes = results.filter(r => r.status === 'pass').length;

  console.log('=== Summary ===');
  console.log(`✅ Passed: ${passes}`);
  console.log(`⚠️  Warnings: ${warnings}`);
  console.log(`❌ Failed: ${failures}\n`);

  if (failures > 0) {
    console.log('❌ Setup validation failed. Please fix the issues above.');
    process.exit(1);
  } else if (warnings > 0) {
    console.log('⚠️  Setup validation passed with warnings.');
  } else {
    console.log('✅ All checks passed! Your setup is ready.');
  }
}

async function validateEnvironmentVariables() {
  console.log('Checking environment variables...');

  const requiredVars = [
    'GOOGLE_CLIENT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  ];

  let allPresent = true;

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      addResult(
        `Environment Variable: ${varName}`,
        'fail',
        `Missing required environment variable. Add it to .env.local`
      );
      allPresent = false;
    } else {
      addResult(
        `Environment Variable: ${varName}`,
        'pass',
        'Environment variable is set'
      );
    }
  }

  return allPresent;
}

async function validateGoogleCredentials() {
  console.log('Validating Google credentials...');

  try {
    const email = process.env.GOOGLE_CLIENT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY;

    if (!email || !key) {
      addResult(
        'Google Credentials',
        'fail',
        'Google credentials not found in environment variables'
      );
      return false;
    }

    // Check private key format
    if (!key.includes('BEGIN PRIVATE KEY') || !key.includes('END PRIVATE KEY')) {
      addResult(
        'Google Private Key Format',
        'fail',
        'Private key format is invalid. It should include BEGIN and END markers'
      );
      return false;
    }

    addResult(
      'Google Private Key Format',
      'pass',
      'Private key format looks correct'
    );

    // Try to authenticate
    const auth = new google.auth.JWT({
      email: email,
      key: key.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    await auth.authorize();

    addResult(
      'Google Authentication',
      'pass',
      'Successfully authenticated with Google APIs'
    );

    return true;
  } catch (error: any) {
    addResult(
      'Google Authentication',
      'fail',
      `Authentication failed: ${error.message}`
    );
    return false;
  }
}

async function validateCalendarAPI() {
  console.log('Checking Google Calendar API...');

  try {
    const email = process.env.GOOGLE_CLIENT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY;

    if (!email || !key) {
      addResult(
        'Calendar API',
        'fail',
        'Cannot test Calendar API without credentials'
      );
      return false;
    }

    const auth = new google.auth.JWT({
      email: email,
      key: key.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    await auth.authorize();

    const calendar = google.calendar({ version: 'v3', auth });

    // Try to list calendars (read-only test)
    const res = await calendar.calendarList.list({
      maxResults: 1,
    });

    addResult(
      'Calendar API Access',
      'pass',
      'Calendar API is accessible and working'
    );

    return true;
  } catch (error: any) {
    if (error.message.includes('disabled')) {
      addResult(
        'Calendar API Access',
        'fail',
        'Calendar API is not enabled. Enable it in Google Cloud Console'
      );
    } else if (error.message.includes('permission')) {
      addResult(
        'Calendar API Access',
        'fail',
        'Service account lacks permissions. Check IAM roles'
      );
    } else {
      addResult(
        'Calendar API Access',
        'fail',
        `Calendar API error: ${error.message}`
      );
    }
    return false;
  }
}

async function validateFirebaseConfig() {
  console.log('Checking Firebase configuration...');

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!apiKey || !authDomain || !projectId) {
    addResult(
      'Firebase Configuration',
      'fail',
      'Firebase configuration is incomplete'
    );
    return false;
  }

  // Validate format
  if (!authDomain.includes('firebaseapp.com') && !authDomain.includes('web.app')) {
    addResult(
      'Firebase Auth Domain',
      'warning',
      'Auth domain format looks unusual. Verify it is correct'
    );
  } else {
    addResult(
      'Firebase Auth Domain',
      'pass',
      'Auth domain format looks correct'
    );
  }

  if (apiKey.length < 30) {
    addResult(
      'Firebase API Key',
      'warning',
      'API key seems too short. Verify it is correct'
    );
  } else {
    addResult(
      'Firebase API Key',
      'pass',
      'API key format looks correct'
    );
  }

  addResult(
    'Firebase Configuration',
    'pass',
    'Firebase configuration is present'
  );

  return true;
}

async function validateProjectStructure() {
  console.log('Checking project structure...');

  const fs = require('fs');
  const path = require('path');

  const requiredFiles = [
    'app/api/meet/create/route.ts',
    'app/api/meet/end/route.ts',
    'utils/googleMeetApi.ts',
    'components/Whiteboard.tsx',
    'components/ui/slider.tsx',
  ];

  let allPresent = true;

  for (const file of requiredFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      addResult(
        `File: ${file}`,
        'pass',
        'File exists'
      );
    } else {
      addResult(
        `File: ${file}`,
        'fail',
        'File is missing. Create this file'
      );
      allPresent = false;
    }
  }

  return allPresent;
}

async function runValidation() {
  console.log('🔍 Starting setup validation...\n');

  try {
    // Step 1: Check environment variables
    const envValid = await validateEnvironmentVariables();

    // Step 2: Validate Google credentials (only if env vars present)
    if (envValid) {
      await validateGoogleCredentials();
      await validateCalendarAPI();
    }

    // Step 3: Validate Firebase config
    await validateFirebaseConfig();

    // Step 4: Check project structure
    await validateProjectStructure();

    // Print results
    printResults();
  } catch (error: any) {
    console.error('❌ Validation failed with error:', error.message);
    process.exit(1);
  }
}

// Run validation
runValidation();