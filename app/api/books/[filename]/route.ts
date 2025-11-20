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
    console.log(`📝 Saving book: ${safeTitle}`)
    console.log(`   Chapters: ${data.chapters?.length || 0}`)
    
    const firestore = getFirestoreClient()
    
    // Upsert book: create if not exists, update if exists
    let book = await firestore.getBookBySafeTitle(safeTitle)
    if (!book) {
      // Create new book if not found
      const bookTitle = data.book_title || safeTitle.replace(/_/g, ' ')
      const chapterCount = data.chapters?.length || data.chapter_count || 0
      book = await firestore.upsertBook(safeTitle, {
        title: bookTitle,
        chapter_count: chapterCount,
        status: 'pending',
      })
      console.log(`Created new book: ${safeTitle}`)
    } else {
      // Update existing book metadata if provided
      if (data.book_title || data.chapter_count !== undefined) {
        await firestore.updateBook(book.id, {
          title: data.book_title || book.title,
          chapter_count: data.chapter_count || data.chapters?.length || book.chapter_count,
        })
      }
    }
    
    // Upsert chapters and pages
    if (data.chapters && Array.isArray(data.chapters)) {
      for (let chapterIndex = 0; chapterIndex < data.chapters.length; chapterIndex++) {
        const chapterData = data.chapters[chapterIndex]
        const chapterTitle = chapterData.title || `Chapter ${chapterIndex + 1}`
        const narrationText = chapterData.narration_version || chapterData.content || ''
        
        console.log(`  Processing chapter ${chapterIndex + 1}: ${chapterTitle}`)
        
        // Upsert chapter: create if not exists, update if exists
        let chapter = await firestore.upsertChapter(book.id, chapterTitle, {
          narration_version: narrationText,
          order_index: chapterIndex,
        })
        
        // Update pages (support both new format sub_stories and old format sections)
        const readingVersion = chapterData.reading_version || {}
        
        // New format: sub_stories
        if (readingVersion.sub_stories && Array.isArray(readingVersion.sub_stories)) {
          console.log(`    Found ${readingVersion.sub_stories.length} sub-stories for chapter ${chapter.id}`)
          console.log(`    Chapter ID type: ${typeof chapter.id}, value: ${chapter.id}`)
          for (const subStory of readingVersion.sub_stories) {
            const subStoryNumber = subStory.sub_story_number || 0
            const subStoryContent = subStory.content || ''
            const subStoryTitle = subStory.title || ''
            
            console.log(`    Saving sub-story ${subStoryNumber}:`, {
              title: subStoryTitle,
              content_length: subStoryContent.length,
              content_preview: subStoryContent.substring(0, 100) || '(empty)',
              has_content: !!subStoryContent
            })
            
            // Upsert sub-story (save mini story content)
            let subStoryId: string | undefined = undefined
            try {
              console.log(`    Attempting to upsert sub-story ${subStoryNumber}...`)
              console.log(`    Chapter ID: ${chapter.id}, Sub-story number: ${subStoryNumber}`)
              console.log(`    Content length: ${subStoryContent.length}, Title: ${subStoryTitle}`)
              
              const result = await firestore.upsertSubStory(chapter.id, subStoryNumber, {
                title: subStoryTitle,
                content: subStoryContent, // Mini story content
              })
              
              console.log(`    upsertSubStory returned:`, {
                hasResult: !!result,
                resultType: typeof result,
                hasId: result?.id ? true : false,
                id: result?.id,
                keys: result ? Object.keys(result) : []
              })
              
              // Check if result is valid
              if (!result) {
                console.error(`    ❌ upsertSubStory returned undefined or null`)
                throw new Error('upsertSubStory returned undefined')
              }
              
              if (!result.id) {
                console.warn(`    ⚠️ upsertSubStory result missing id field`)
                console.warn(`    Result object:`, JSON.stringify(result, null, 2))
                // Try to get it from Firestore
                const subStories = await firestore.getSubStoriesByChapterId(chapter.id)
                const savedSubStory = subStories.find(s => s.sub_story_number === subStoryNumber)
                if (savedSubStory?.id) {
                  subStoryId = savedSubStory.id
                  console.log(`    ✅ Found sub-story ID from Firestore: ${subStoryId}`)
                } else {
                  throw new Error(`Could not find sub-story ${subStoryNumber} after upsert. Result: ${JSON.stringify(result)}`)
                }
              } else {
                subStoryId = result.id
                console.log(`    ✅ Saved sub-story ${subStoryNumber} (ID: ${subStoryId}) with content (${subStoryContent.length} chars)`)
              }
              
              // Verify it was saved
              const verifySubStory = await firestore.getSubStoriesByChapterId(chapter.id)
              const savedSubStory = verifySubStory.find(s => s.sub_story_number === subStoryNumber)
              if (savedSubStory) {
                console.log(`    ✅ Verified: sub-story ${subStoryNumber} has content length: ${savedSubStory.content?.length || 0}`)
                if (savedSubStory.content?.length !== subStoryContent.length) {
                  console.warn(`    ⚠️ Content length mismatch! Expected ${subStoryContent.length}, got ${savedSubStory.content?.length || 0}`)
                }
                // Use the verified ID if we don't have one yet
                if (!subStoryId && savedSubStory.id) {
                  subStoryId = savedSubStory.id
                  console.log(`    ✅ Using verified sub-story ID: ${subStoryId}`)
                }
              } else {
                console.warn(`    ⚠️ Warning: Could not verify sub-story ${subStoryNumber} was saved`)
              }
            } catch (error: any) {
              console.error(`    ❌ Failed to save sub-story ${subStoryNumber}:`, {
                message: error.message,
                code: error.code,
                stack: error.stack,
                chapterId: chapter.id,
                subStoryNumber: subStoryNumber,
                contentLength: subStoryContent.length
              })
              // Re-throw with more context
              throw new Error(`Failed to save sub-story ${subStoryNumber}: ${error.message || 'Unknown error'}`)
            }
            
            // Get the sub-story ID if we still don't have it (we'll need it for pages)
            if (!subStoryId) {
              console.warn(`    ⚠️ Still no sub-story ID, attempting final fetch...`)
              const subStories = await firestore.getSubStoriesByChapterId(chapter.id)
              const subStoryDoc = subStories.find(s => s.sub_story_number === subStoryNumber)
              subStoryId = subStoryDoc?.id
              if (subStoryId) {
                console.log(`    ✅ Retrieved sub-story ID on final attempt: ${subStoryId}`)
              } else {
                console.warn(`    ⚠️ Could not find sub-story ID for number ${subStoryNumber} after all attempts`)
              }
            }
            
            if (subStory.sections && Array.isArray(subStory.sections)) {
              console.log(`    Processing ${subStory.sections.length} sections for sub-story ${subStoryNumber}`)
              for (const section of subStory.sections) {
                try {
                  const pageNumber = section.page_number || 0
                  const imageUrl = section.illustration_image || ''
                  const isGcsKey = imageUrl.startsWith('books/')
                  
                  // Upsert page: create if not exists, update if exists
                  // Note: In the new schema, pages should have sub_story_id, but we'll use chapter_id for backward compatibility
                  await firestore.upsertPage(chapter.id, pageNumber, {
                    dialogue: section.dialogue || '',
                    illustration_prompt: section.illustration_prompt || '',
                    image_url: imageUrl.startsWith('http') ? imageUrl : undefined,
                    image_gcs_key: isGcsKey ? imageUrl : undefined,
                  })
                } catch (pageError: any) {
                  console.error(`    ⚠️ Failed to save page ${section.page_number} for sub-story ${subStoryNumber}:`, pageError.message)
                  // Don't throw - continue with other pages
                }
              }
            }
          }
        }
        // Old format: direct sections (backward compatibility)
        else if (readingVersion.sections && Array.isArray(readingVersion.sections)) {
          console.log(`    Found ${readingVersion.sections.length} sections (old format)`)
          for (const section of readingVersion.sections) {
            try {
              const pageNumber = section.page_number || 0
              const imageUrl = section.illustration_image || ''
              const isGcsKey = imageUrl.startsWith('books/')
              
              // Upsert page: create if not exists, update if exists
              await firestore.upsertPage(chapter.id, pageNumber, {
                dialogue: section.dialogue || '',
                illustration_prompt: section.illustration_prompt || '',
                image_url: imageUrl.startsWith('http') ? imageUrl : undefined,
                image_gcs_key: isGcsKey ? imageUrl : undefined,
              })
            } catch (pageError: any) {
              console.error(`    ⚠️ Failed to save page ${section.page_number}:`, pageError.message)
              // Don't throw - continue with other pages
            }
          }
        }
      }
    }
    
    return NextResponse.json({ success: true, message: 'Book updated successfully' })
  } catch (error: any) {
    console.error('❌ Error updating book in Firestore:', error)
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    return NextResponse.json(
      { 
        error: 'Failed to update book',
        details: error.message || 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const safeTitle = decodeURIComponent(params.filename)
    const firestore = getFirestoreClient()
    
    // Check if book exists
    const book = await firestore.getBookBySafeTitle(safeTitle)
    if (!book) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404 }
      )
    }
    
    // Delete book and all related data (chapters, pages, processing steps)
    await firestore.deleteBook(safeTitle)
    
    // Optionally delete files from GCS
    try {
      const { getGCSClient } = await import('@/lib/gcs')
      const gcs = getGCSClient()
      const { Storage } = await import('@google-cloud/storage')
      const storage = new Storage()
      const bucketName = process.env.GCS_BUCKET || ''
      
      if (bucketName) {
        const bucket = storage.bucket(bucketName)
        const prefix = `books/${safeTitle}/`
        
        // List and delete all files with this prefix
        const [files] = await bucket.getFiles({ prefix })
        await Promise.all(files.map(file => file.delete()))
        console.log(`Deleted ${files.length} files from GCS for book: ${safeTitle}`)
      }
    } catch (gcsError: any) {
      // Log but don't fail if GCS deletion fails
      console.warn(`Failed to delete GCS files for ${safeTitle}:`, gcsError.message)
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Book "${safeTitle}" and all related data deleted successfully` 
    })
  } catch (error: any) {
    console.error('Error deleting book:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete book' },
      { status: 500 }
    )
  }
}

