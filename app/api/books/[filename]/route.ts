import { NextRequest, NextResponse } from 'next/server'
import { getFirestoreClient } from '@/lib/firestore'

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const safeTitle = decodeURIComponent(params.filename)
    const firestore = getFirestoreClient()
    const bookData = await firestore.getBookWithChaptersAndPages(safeTitle)
    
    if (!bookData) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(bookData)
  } catch (error) {
    console.error('Error reading book from Firestore:', error)
    return NextResponse.json(
      { error: 'Failed to read book' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const safeTitle = decodeURIComponent(params.filename)
    const data = await request.json()
    const firestore = getFirestoreClient()
    
    // Get the book first
    const book = await firestore.getBookBySafeTitle(safeTitle)
    if (!book) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404 }
      )
    }
    
    // Update chapters and pages
    if (data.chapters && Array.isArray(data.chapters)) {
      for (const chapterData of data.chapters) {
        if (chapterData.id) {
          // Update chapter narration_version
          const narrationText = chapterData.narration_version || chapterData.content || ''
          await firestore.updateChapter(chapterData.id, {
            narration_version: narrationText,
          })
          
          // Update pages (support both new format sub_stories and old format sections)
          const readingVersion = chapterData.reading_version || {}
          
          // New format: sub_stories
          if (readingVersion.sub_stories && Array.isArray(readingVersion.sub_stories)) {
            const pages = await firestore.getPagesByChapterId(chapterData.id)
            
            for (const subStory of readingVersion.sub_stories) {
              if (subStory.sections && Array.isArray(subStory.sections)) {
                for (const section of subStory.sections) {
                  const page = pages.find(p => p.page_number === section.page_number)
                  if (page) {
                    // Determine if illustration_image is a URL or GCS key
                    const imageUrl = section.illustration_image || ''
                    const isGcsKey = imageUrl.startsWith('books/')
                    
                    await firestore.updatePage(page.id, {
                      dialogue: section.dialogue || '',
                      illustration_prompt: section.illustration_prompt || '',
                      image_url: imageUrl.startsWith('http') ? imageUrl : undefined,
                      image_gcs_key: isGcsKey ? imageUrl : undefined,
                    })
                  }
                }
              }
            }
          }
          // Old format: direct sections (backward compatibility)
          else if (readingVersion.sections && Array.isArray(readingVersion.sections)) {
            const pages = await firestore.getPagesByChapterId(chapterData.id)
            
            for (const section of readingVersion.sections) {
              const page = pages.find(p => p.page_number === section.page_number)
              if (page) {
                // Determine if illustration_image is a URL or GCS key
                const imageUrl = section.illustration_image || ''
                const isGcsKey = imageUrl.startsWith('books/')
                
                await firestore.updatePage(page.id, {
                  dialogue: section.dialogue || '',
                  illustration_prompt: section.illustration_prompt || '',
                  image_url: imageUrl.startsWith('http') ? imageUrl : undefined,
                  image_gcs_key: isGcsKey ? imageUrl : undefined,
                })
              }
            }
          }
        }
      }
    }
    
    return NextResponse.json({ success: true, message: 'Book updated successfully' })
  } catch (error) {
    console.error('Error updating book in Firestore:', error)
    return NextResponse.json(
      { error: 'Failed to update book' },
      { status: 500 }
    )
  }
}

