import { NextRequest, NextResponse } from 'next/server'
import { getFirestoreClient } from '@/lib/firestore'

export async function GET() {
  try {
    console.log('📚 Fetching books from Firestore...')
    const firestore = getFirestoreClient()
    
    // Log collection name for debugging
    const collectionName = (firestore as any).booksCollection
    console.log(`🔍 Querying collection: ${collectionName}`)
    
    const books = await firestore.getAllBooks()
    
    console.log(`✅ Found ${books.length} books in Firestore`)
    
    if (books.length > 0) {
      console.log('📖 Sample book data:', JSON.stringify(books[0], null, 2))
    } else {
      console.log('⚠️ No books found in Firestore. Books may not have been created yet.')
      console.log('💡 Tip: Check the Firestore Viewer at /firestore to verify books exist')
    }
    
    const bookList = books.map(book => {
      const safeTitle = book.safe_title || book.id
      return {
        filename: safeTitle,
        book_title: book.title || 'Untitled Book',
        chapter_count: book.chapter_count || 0,
      }
    }).filter(book => book.filename) // Filter out books without safe_title
    
    console.log(`📋 Returning ${bookList.length} books`)
    
    return NextResponse.json({ 
      books: bookList,
      total: bookList.length,
      source: 'firestore',
      collection: collectionName
    })
  } catch (error: any) {
    console.error('❌ Error reading books from Firestore:', error)
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    
    return NextResponse.json(
      { 
        error: 'Failed to read books',
        details: error.message,
        books: [], // Return empty array instead of failing
        source: 'firestore'
      },
      { status: 500 }
    )
  }
}

