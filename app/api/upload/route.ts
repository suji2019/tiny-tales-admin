import { NextRequest, NextResponse } from 'next/server'
import { getGCSClient } from '@/lib/gcs'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const bookSafeTitle = formData.get('bookSafeTitle') as string
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }
    
    if (!bookSafeTitle) {
      return NextResponse.json(
        { error: 'Book safe title is required' },
        { status: 400 }
      )
    }
    
    // Convert file to buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    
    // Generate unique filename
    const timestamp = Date.now()
    const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filename = `${timestamp}_${originalName}`
    
    // Upload to GCS
    const gcs = getGCSClient()
    const contentType = file.type || undefined
    const { gcsKey, url } = await gcs.uploadImage(buffer, filename, bookSafeTitle, contentType)
    
    return NextResponse.json({
      success: true,
      filename,
      path: url, // Return the public URL
      gcsKey,
      url,
    })
  } catch (error) {
    console.error('Error uploading file to GCS:', error)
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    )
  }
}

