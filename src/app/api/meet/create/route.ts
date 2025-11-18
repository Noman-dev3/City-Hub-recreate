// app/api/meet/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createMeeting } from '@/utils/googleMeetApi';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { className, startTime, endTime, attendees } = body;

    if (!className || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const meeting = await createMeeting(
      className,
      new Date(startTime),
      new Date(endTime),
      attendees
    );

    return NextResponse.json({
      success: true,
      meeting,
    });
  } catch (error) {
    console.error('Meet API Error:', error);
    return NextResponse.json(
      { error: 'Failed to create meeting' },
      { status: 500 }
    );
  }
}

