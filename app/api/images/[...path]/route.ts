import { NextRequest, NextResponse } from 'next/server'

// This route now redirects to GCS URLs or serves images from GCS
// If the image path is already a full URL, redirect to it
// Otherwise, construct the GCS URL
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const imagePath = params.path.join('/')
    
    // If it's already a full URL (starts with http), redirect to it
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return NextResponse.redirect(imagePath)
    }
    
    // Otherwise, construct GCS URL
    const bucketName = process.env.GCS_BUCKET || ''
    if (!bucketName) {
      return NextResponse.json(
        { error: 'GCS bucket not configured' },
        { status: 500 }
      )
    }
    
    // If path starts with books/, it's already a GCS key
    const gcsKey = imagePath.startsWith('books/') ? imagePath : `books/${imagePath}`
    const gcsUrl = `https://storage.googleapis.com/${bucketName}/${gcsKey}`
    
    return NextResponse.redirect(gcsUrl)
  } catch (error) {
    console.error('Error serving image:', error)
    return NextResponse.json(
      { error: 'Failed to serve image' },
      { status: 500 }
    )
  }
}

