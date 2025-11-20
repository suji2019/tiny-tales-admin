import { NextRequest, NextResponse } from 'next/server'
import { getFirestoreClient } from '@/lib/firestore'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { bookSafeTitle } = body

    if (!bookSafeTitle) {
      return NextResponse.json(
        { success: false, error: 'bookSafeTitle is required' },
        { status: 400 }
      )
    }

    const firestore = getFirestoreClient()
    
    // Check if book exists
    const book = await firestore.getBookBySafeTitle(bookSafeTitle)
    if (!book) {
      return NextResponse.json(
        { success: false, error: 'Book not found' },
        { status: 404 }
      )
    }

    // Update book status to cancelled
    await firestore.updateBook(book.id, {
      status: 'cancelled',
    })

    // Update all in-progress processing steps to cancelled
    const cancelledStepsCount = await firestore.cancelProcessingStepsByBookId(book.id)

    return NextResponse.json({
      success: true,
      message: `Pipeline for "${bookSafeTitle}" stopped successfully`,
      cancelledSteps: cancelledStepsCount,
    })
  } catch (error: any) {
    console.error('Error stopping pipeline:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to stop pipeline',
      },
      { status: 500 }
    )
  }
}

