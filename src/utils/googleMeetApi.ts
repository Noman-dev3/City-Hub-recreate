import { google } from 'googleapis';

const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || '';
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY || '';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

async function getAuth() {
  // 1. Clean the key string using standard string manipulation
  const privateKey = GOOGLE_PRIVATE_KEY
    .replace(/\\n/g, '\n')   // Convert literal \n to actual newlines
    .replace(/"/g, '')       // Remove all double quotes
    .replace(/,$/, '')       // Remove trailing comma if copied from JSON
    .trim();                 // Remove extra whitespace

  const auth = new google.auth.JWT({
    email: GOOGLE_CLIENT_EMAIL,
    key: privateKey,
    scopes: GOOGLE_SCOPES,
  });

  await auth.authorize();
  return auth;
}

export async function createMeeting(
  className: string, 
  startTime: Date, 
  endTime: Date,
  attendees?: string[]
) {
  try {
    const auth = await getAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    // PASTE YOUR PERMANENT LINK HERE
    const MY_MEET_LINK = 'https://meet.google.com/ckv-yomj-rma'; 

    const event = {
      summary: `${className} - Live Class`,
      description: `Join the class here: ${MY_MEET_LINK}\n\nInteractive live class session.`,
      location: MY_MEET_LINK, // This makes the link appear in the "Location" field
      start: {
        dateTime: startTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      attendees: attendees?.map(email => ({ email })) || [],
      // REMOVED the conferenceData block completely
    };

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'all',
    });

    return {
      eventId: res.data.id,
      meetLink: MY_MEET_LINK, // Return your manual link
      htmlLink: res.data.htmlLink,
    };
  } catch (error) {
    console.error('Google Meet Create Error:', error);
    throw new Error('Failed to create Google Meet session.');
  }
}

export async function endMeeting(eventId: string) {
  try {
    const auth = await getAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
      sendUpdates: 'all',
    });

    return { success: true };
  } catch (error) {
    console.error('Google Meet End Error:', error);
    throw new Error('Failed to end Google Meet session.');
  }
}

export async function updateMeeting(
  eventId: string,
  updates: {
    endTime?: Date;
    attendees?: string[];
  }
) {
  try {
    const auth = await getAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    const event = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId,
    });

    const updatedEvent = {
      ...event.data,
      ...(updates.endTime && {
        end: {
          dateTime: updates.endTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      }),
      ...(updates.attendees && {
        attendees: updates.attendees.map(email => ({ email })),
      }),
    };

    const res = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: updatedEvent,
      sendUpdates: 'all',
    });

    return res.data;
  } catch (error) {
    console.error('Google Meet Update Error:', error);
    throw new Error('Failed to update Google Meet session.');
  }
}