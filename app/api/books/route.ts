import { NextRequest, NextResponse } from 'next/server'
import { getFirestoreClient } from '@/lib/firestore'

export async function GET() {
  try {
    const firestore = getFirestoreClient()
    const books = await firestore.getAllBooks()
    
    const bookList = books.map(book => ({
      filename: book.safe_title,
      book_title: book.title,
      chapter_count: book.chapter_count || 0,
    }))
    
    return NextResponse.json({ books: bookList })
  } catch (error) {
    console.error('Error reading books from Firestore:', error)
    return NextResponse.json(
      { error: 'Failed to read books' },
      { status: 500 }
    )
  }
}

