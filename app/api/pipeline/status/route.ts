import { NextRequest, NextResponse } from 'next/server'
import { getFirestoreClient } from '@/lib/firestore'

// Processing status enum values (matching Python backend)
enum ProcessingStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const bookSafeTitle = searchParams.get('bookSafeTitle')

    if (!bookSafeTitle) {
      return NextResponse.json(
        { error: 'bookSafeTitle is required' },
        { status: 400 }
      )
    }

    const firestore = getFirestoreClient()
    
    // Get book first to get the book_id
    const book = await firestore.getBookBySafeTitle(bookSafeTitle)
    
    // If book doesn't exist, return empty status
    if (!book) {
      console.log(`Book not found for safe_title: ${bookSafeTitle}`)
      return NextResponse.json({
        bookSafeTitle,
        bookStatus: 'not_found',
        overallStatus: 'unknown',
        isProcessing: false,
        steps: [],
      })
    }

    // Get processing steps using book_id
    const steps = await firestore.getProcessingStepsByBookId(book.id)
    const bookStatus = book.status || 'unknown'
    
    console.log(`Pipeline status for ${bookSafeTitle}: book_id=${book.id}, status=${bookStatus}, steps=${steps.length}`)

    // Determine overall pipeline status based on book status and processing steps
    const stepStatuses = steps.map(step => step.status || 'unknown')
    let overallStatus = 'unknown'
    let isProcessing = false

    // Check book status first (most reliable indicator)
    if (bookStatus === 'processing' || bookStatus === 'in_progress') {
      overallStatus = 'processing'
      isProcessing = true
    } else if (bookStatus === 'completed') {
      overallStatus = 'completed'
      isProcessing = false
    } else if (bookStatus === 'failed') {
      overallStatus = 'failed'
      isProcessing = false
    } else {
      // Fallback to step statuses - check if any step is in progress
      const hasInProgress = stepStatuses.some(s => {
        const status = (s || '').toLowerCase()
        return status === 'in_progress' || status === 'processing' || status === ProcessingStatus.IN_PROGRESS
      })
      const hasFailed = stepStatuses.some(s => {
        const status = (s || '').toLowerCase()
        return status === 'failed' || status === ProcessingStatus.FAILED
      })
      const allCompleted = stepStatuses.length > 0 && stepStatuses.every(s => {
        const status = (s || '').toLowerCase()
        return status === 'completed' || status === ProcessingStatus.COMPLETED
      })
      
      if (hasInProgress) {
        overallStatus = 'processing'
        isProcessing = true
      } else if (hasFailed) {
        overallStatus = 'failed'
        isProcessing = false
      } else if (allCompleted) {
        overallStatus = 'completed'
        isProcessing = false
      } else if (stepStatuses.length === 0) {
        overallStatus = 'pending'
        isProcessing = false
      } else {
        // Mixed statuses or unknown
        overallStatus = 'processing'
        isProcessing = true
      }
    }

    return NextResponse.json({
      bookSafeTitle,
      bookStatus,
      overallStatus,
      isProcessing,
      steps: steps.map(step => ({
        id: step.id,
        step_name: step.step_name,
        status: step.status,
        error_message: step.error_message,
        updated_at: step.updated_at,
        created_at: step.created_at,
      })),
    })
  } catch (error: any) {
    console.error('Error fetching pipeline status:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to fetch pipeline status',
      },
      { status: 500 }
    )
  }
}

