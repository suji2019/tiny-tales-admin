import { NextRequest, NextResponse } from 'next/server'
import { getFirestoreClient } from '@/lib/firestore'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { bookSafeTitle: string } }
) {
  try {
    const bookSafeTitle = decodeURIComponent(params.bookSafeTitle)
    const firestore = getFirestoreClient()
    
    // Check if book exists
    const book = await firestore.getBookBySafeTitle(bookSafeTitle)
    if (!book) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404 }
      )
    }
    
    // Delete all processing steps for this book
    await firestore.deleteProcessingStepsByBookId(book.id)
    
    return NextResponse.json({ 
      success: true, 
      message: `All processing steps for "${bookSafeTitle}" deleted successfully` 
    })
  } catch (error: any) {
    console.error('Error deleting pipeline steps:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete pipeline steps' },
      { status: 500 }
    )
  }
}

