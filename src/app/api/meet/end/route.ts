// app/api/meet/end/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { endMeeting } from '@/utils/googleMeetApi';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventId } = body;

    if (!eventId) {
      return NextResponse.json(
        { error: 'Missing event ID' },
        { status: 400 }
      );
    }

    await endMeeting(eventId);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Meet End API Error:', error);
    return NextResponse.json(
      { error: 'Failed to end meeting' },
      { status: 500 }
    );
  }
}