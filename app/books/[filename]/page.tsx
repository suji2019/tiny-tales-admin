'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { StoryBook, Chapter, PageSection } from '@/types/storybook'
import PageRenderer from '@/components/PageRenderer'

export default function BookEditor() {
  const params = useParams()
  const router = useRouter()
  const filename = params.filename as string
  
  const [book, setBook] = useState<StoryBook | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0)
  const [selectedSubStoryIndex, setSelectedSubStoryIndex] = useState(0)
  const [selectedPageIndex, setSelectedPageIndex] = useState(0)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [viewMode, setViewMode] = useState<'edit' | 'render'>('edit')

  useEffect(() => {
    if (filename) {
      loadBook()
    }
  }, [filename])
  
  // Add missing dependency warning fix
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const loadBook = async () => {
    try {
      setLoading(true)
      const encodedFilename = encodeURIComponent(filename)
      const response = await fetch(`/api/books/${encodedFilename}`)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to load book`)
      }
      
      const data = await response.json()
      
      if (data.error) {
        throw new Error(data.error)
      }
      
      // Validate and set book data
      if (data && data.chapters && Array.isArray(data.chapters)) {
        setBook(data)
        // Reset to first chapter if current selection is invalid
        if (selectedChapterIndex >= data.chapters.length) {
          setSelectedChapterIndex(0)
          setSelectedSubStoryIndex(0)
          setSelectedPageIndex(0)
        } else {
          // Reset sub-story and page when chapter changes
          const currentChapter = data.chapters[selectedChapterIndex]
          if (currentChapter?.reading_version?.sub_stories) {
            if (selectedSubStoryIndex >= currentChapter.reading_version.sub_stories.length) {
              setSelectedSubStoryIndex(0)
              setSelectedPageIndex(0)
            }
          }
        }
        console.log(`Loaded book: ${data.book_title} with ${data.chapters.length} chapters`)
      } else {
        throw new Error('Invalid book data format')
      }
    } catch (error: any) {
      console.error('Error loading book:', error)
      alert(`Failed to load book: ${error.message || error}`)
    } finally {
      setLoading(false)
    }
  }

  const saveBook = async () => {
    if (!book) return
    
    try {
      setSaving(true)
      
      // Log what we're saving for debugging
      console.log('📝 Saving book:', {
        bookTitle: book.book_title,
        chaptersCount: book.chapters.length
      })
      
      // Check all sub-stories for content
      book.chapters.forEach((chapter, chIdx) => {
        if (chapter.reading_version?.sub_stories) {
          chapter.reading_version.sub_stories.forEach((subStory, ssIdx) => {
            console.log(`  Chapter ${chIdx} Sub-story ${ssIdx}:`, {
              number: subStory.sub_story_number,
              title: subStory.title,
              contentLength: subStory.content?.length || 0,
              hasContent: !!subStory.content,
              contentPreview: subStory.content?.substring(0, 100) || '(empty)'
            })
          })
        }
      })
      
      const currentChapter = book.chapters[selectedChapterIndex]
      if (currentChapter?.reading_version?.sub_stories) {
        const subStory = currentChapter.reading_version.sub_stories[selectedSubStoryIndex]
        if (subStory) {
          console.log('💾 Saving current sub-story content:', {
            chapter: currentChapter.title,
            subStoryNumber: subStory.sub_story_number,
            contentLength: subStory.content?.length || 0,
            contentPreview: subStory.content?.substring(0, 100) || 'empty'
          })
        }
      }
      
      const response = await fetch(`/api/books/${filename}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(book),
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('❌ Save failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        })
        throw new Error(errorData.error || errorData.details || `HTTP ${response.status}: Failed to save book`)
      }
      
      const result = await response.json()
      console.log('✅ Book saved successfully:', result)
      alert('✅ Book saved successfully!')
      
      // Reload the book to get the latest data from Firestore
      await loadBook()
    } catch (error: any) {
      console.error('❌ Error saving book:', error)
      console.error('Error details:', {
        message: error.message,
        stack: error.stack
      })
      alert(`❌ Failed to save book: ${error.message || error}\n\nCheck browser console for details.`)
    } finally {
      setSaving(false)
    }
  }

  const updatePageSection = (field: keyof PageSection, value: string) => {
    if (!book) return
    
    const updatedBook = { ...book }
    const chapter = updatedBook.chapters[selectedChapterIndex]
    if (!chapter) return
    
    // Support both sub_stories structure and direct sections
    if (chapter.reading_version?.sub_stories) {
      // New format: sub_stories - update the page in the selected sub-story
      const subStories = chapter.reading_version.sub_stories
      if (subStories[selectedSubStoryIndex]) {
        const sections = subStories[selectedSubStoryIndex].sections || []
        const page = sections[selectedPageIndex]
        if (page) {
          ;(page as any)[field] = value
          setBook(updatedBook)
          return
        }
      }
    } else {
      // Old format: direct sections
      if (!chapter.reading_version?.sections) return
      const page = chapter.reading_version.sections[selectedPageIndex]
      if (!page) return
      ;(page as any)[field] = value
      setBook(updatedBook)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !book) return
    
    try {
      setUploadingImage(true)
      const formData = new FormData()
      formData.append('file', file)
      // Pass the book safe title (filename) for GCS path
      formData.append('bookSafeTitle', decodeURIComponent(filename))
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) throw new Error('Failed to upload image')
      
      const data = await response.json()
      updatePageSection('illustration_image', data.url || data.path)
      
      alert('Image uploaded successfully!')
    } catch (error) {
      console.error('Error uploading image:', error)
      alert('Failed to upload image')
    } finally {
      setUploadingImage(false)
    }
  }

  const updateChapterNarration = (chapterIndex: number, narration: string) => {
    if (!book) return
    
    const updatedBook = { ...book }
    const chapter = updatedBook.chapters[chapterIndex]
    if (!chapter) return
    
    chapter.narration_version = narration
    chapter.content = narration
    setBook(updatedBook)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading book...</div>
      </div>
    )
  }

  if (!book) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Book not found</div>
      </div>
    )
  }

  // Support both sub_stories structure and direct sections
  const getSections = (chapter: Chapter) => {
    if (chapter.reading_version?.sub_stories) {
      // New format: sub_stories
      return chapter.reading_version.sub_stories.flatMap(subStory => subStory.sections || [])
    } else {
      // Old format: direct sections
      return chapter.reading_version?.sections || []
    }
  }

  const hasSubStories = (chapter: Chapter) => {
    return chapter.reading_version?.sub_stories && chapter.reading_version.sub_stories.length > 0
  }

  const getSubStories = (chapter: Chapter) => {
    return chapter.reading_version?.sub_stories || []
  }

  const getCurrentSections = () => {
    const chapter = book.chapters[selectedChapterIndex]
    if (!chapter) return []
    
    if (hasSubStories(chapter)) {
      const subStories = getSubStories(chapter)
      if (subStories[selectedSubStoryIndex]) {
        return subStories[selectedSubStoryIndex].sections || []
      }
      return []
    } else {
      return chapter.reading_version?.sections || []
    }
  }

  const currentChapter = book.chapters[selectedChapterIndex]
  const sections = getCurrentSections()
  const currentPage = sections[selectedPageIndex]

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8 pb-24">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <button
                onClick={() => router.push('/')}
                className="text-purple-600 dark:text-purple-400 hover:underline mb-2 flex items-center"
              >
                ← Back to Books
              </button>
              <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
                {book.book_title}
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                {book.chapter_count} {book.chapter_count === 1 ? 'Chapter' : 'Chapters'}
              </p>
            </div>
            <button
              onClick={saveBook}
              disabled={saving}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
            >
              {saving ? 'Saving...' : '💾 Save Changes'}
            </button>
          </div>

          {/* Chapters List */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
            <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">
              All Chapters
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {book.chapters.map((chapter, index) => {
                const chapterSections = getSections(chapter)
                const subStories = hasSubStories(chapter) ? getSubStories(chapter) : []
                return (
                  <button
                    key={index}
                    onClick={() => {
                      setSelectedChapterIndex(index)
                      setSelectedSubStoryIndex(0)
                      setSelectedPageIndex(0)
                    }}
                    className={`px-4 py-3 rounded-lg transition-colors text-left ${
                      selectedChapterIndex === index
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <div className="font-semibold text-sm mb-1">
                      {chapter.title}
                    </div>
                    <div className={`text-xs ${
                      selectedChapterIndex === index
                        ? 'text-purple-100'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {hasSubStories(chapter) 
                        ? `${subStories.length} ${subStories.length === 1 ? 'sub-chapter' : 'sub-chapters'}, ${chapterSections.length} ${chapterSections.length === 1 ? 'page' : 'pages'}`
                        : `${chapterSections.length} ${chapterSections.length === 1 ? 'page' : 'pages'}`
                      }
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Chapter Navigation Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
              <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">
                Current Chapter
              </h2>
              <div className="space-y-2 mb-4">
                {book.chapters.map((chapter, index) => (
                  <div key={index}>
                    <button
                      onClick={() => {
                        setSelectedChapterIndex(index)
                        setSelectedSubStoryIndex(0)
                        setSelectedPageIndex(0)
                      }}
                      className={`w-full text-left px-3 py-2 rounded transition-colors ${
                        selectedChapterIndex === index
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      <div className="font-semibold">{chapter.title}</div>
                      {hasSubStories(chapter) && (
                        <div className={`text-xs mt-1 ${
                          selectedChapterIndex === index
                            ? 'text-purple-100'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {getSubStories(chapter).length} {getSubStories(chapter).length === 1 ? 'sub-chapter' : 'sub-chapters'}
                        </div>
                      )}
                    </button>
                    
                    {/* Show sub-stories for selected chapter */}
                    {selectedChapterIndex === index && hasSubStories(chapter) && (
                      <div className="ml-4 mt-2 space-y-1">
                        {getSubStories(chapter).map((subStory, subIndex) => (
                          <button
                            key={subIndex}
                            onClick={() => {
                              setSelectedSubStoryIndex(subIndex)
                              setSelectedPageIndex(0)
                            }}
                            className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                              selectedSubStoryIndex === subIndex
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-50 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-500'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span>{subStory.title || `Sub-chapter ${subStory.sub_story_number || subIndex + 1}`}</span>
                              <span className={`text-xs ${
                                selectedSubStoryIndex === subIndex
                                  ? 'text-blue-100'
                                  : 'text-gray-500 dark:text-gray-400'
                              }`}>
                                {(subStory.sections || []).length} pages
                              </span>
                            </div>
                            {subStory.content && (
                              <div className={`text-xs mt-1 line-clamp-2 ${
                                selectedSubStoryIndex === subIndex
                                  ? 'text-blue-100'
                                  : 'text-gray-500 dark:text-gray-400'
                              }`}>
                                {subStory.content.substring(0, 60)}...
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Quick Actions */}
              {currentChapter && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                    Quick Actions
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        const bookSafeTitle = decodeURIComponent(filename)
                        // Use the exact chapter title as it appears in the book data
                        const chapterTitle = currentChapter.title
                        console.log('Triggering pipeline for:', { bookTitle: book.book_title, chapterTitle })
                        router.push(`/pipeline/run?book=${encodeURIComponent(book.book_title)}&chapter=${encodeURIComponent(chapterTitle)}`)
                      }}
                      className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      🚀 Run Pipeline for This Chapter
                    </button>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Chapter: {currentChapter.title}
                    </div>
                  </div>
                </div>
              )}

              {/* Page Navigation */}
              {currentChapter && sections.length > 0 && (
                <div className="mt-6">
                  <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">
                    {hasSubStories(currentChapter) 
                      ? `${getSubStories(currentChapter)[selectedSubStoryIndex]?.title || 'Sub-chapter'} - Pages (${sections.length})`
                      : `Pages (${sections.length})`
                    }
                  </h2>
                  <div className="grid grid-cols-5 gap-2">
                    {sections.map((page, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedPageIndex(index)}
                        className={`px-2 py-2 rounded text-sm transition-colors ${
                          selectedPageIndex === index
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {page.page_number}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Page Editor / Renderer */}
          <div className="lg:col-span-3">
            {currentPage ? (
              <div className="space-y-4">
                {/* View Mode Toggle */}
                <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
                  <div>
                    <h2 className="text-2xl font-semibold text-gray-800 dark:text-white">
                      Page {currentPage.page_number}
                    </h2>
                    {hasSubStories(currentChapter) && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {currentChapter.title} → {getSubStories(currentChapter)[selectedSubStoryIndex]?.title || `Sub-chapter ${selectedSubStoryIndex + 1}`}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                      <button
                        onClick={() => setViewMode('edit')}
                        className={`px-4 py-2 rounded transition-colors ${
                          viewMode === 'edit'
                            ? 'bg-purple-600 text-white'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => setViewMode('render')}
                        className={`px-4 py-2 rounded transition-colors ${
                          viewMode === 'render'
                            ? 'bg-purple-600 text-white'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        👁️ View
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (selectedPageIndex > 0) {
                            setSelectedPageIndex(selectedPageIndex - 1)
                          } else if (hasSubStories(currentChapter) && selectedSubStoryIndex > 0) {
                            // Move to previous sub-chapter's last page
                            const prevSubStory = getSubStories(currentChapter)[selectedSubStoryIndex - 1]
                            if (prevSubStory?.sections) {
                              setSelectedSubStoryIndex(selectedSubStoryIndex - 1)
                              setSelectedPageIndex(prevSubStory.sections.length - 1)
                            }
                          }
                        }}
                        disabled={
                          selectedPageIndex === 0 && 
                          (!hasSubStories(currentChapter) || selectedSubStoryIndex === 0)
                        }
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ← Previous
                      </button>
                      <button
                        onClick={() => {
                          if (!sections || sections.length === 0) return
                          if (selectedPageIndex < sections.length - 1) {
                            setSelectedPageIndex(selectedPageIndex + 1)
                          } else if (hasSubStories(currentChapter) && selectedSubStoryIndex < getSubStories(currentChapter).length - 1) {
                            // Move to next sub-chapter's first page
                            setSelectedSubStoryIndex(selectedSubStoryIndex + 1)
                            setSelectedPageIndex(0)
                          }
                        }}
                        disabled={
                          !sections || sections.length === 0 ||
                          (selectedPageIndex === (sections.length - 1) && 
                           (!hasSubStories(currentChapter) || selectedSubStoryIndex === getSubStories(currentChapter).length - 1))
                        }
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                </div>

                {/* Render Mode */}
                {viewMode === 'render' ? (
                  <PageRenderer
                    page={currentPage}
                    bookSafeTitle={decodeURIComponent(filename)}
                    onImageChange={(newImagePath) => {
                      updatePageSection('illustration_image', newImagePath)
                    }}
                  />
                ) : (
                  /* Edit Mode */
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <div className="space-y-6">
                  {/* Chapter Narration Editor */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Chapter Narration (Full Text)
                    </label>
                    <textarea
                      value={currentChapter.narration_version || currentChapter.content || ''}
                      onChange={(e) => updateChapterNarration(selectedChapterIndex, e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      rows={8}
                      placeholder="Enter the full narration text for this chapter..."
                    />
                  </div>

                  {/* Mini Story (Sub-Story Content) Editor - Only show if sub-stories exist */}
                  {hasSubStories(currentChapter) && getSubStories(currentChapter)[selectedSubStoryIndex] && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Mini Story Content (Sub-Story {selectedSubStoryIndex + 1})
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                          - The narration text for this sub-story
                        </span>
                      </label>
                      <textarea
                        value={getSubStories(currentChapter)[selectedSubStoryIndex]?.content || ''}
                        onChange={(e) => {
                          if (!book) return
                          
                          // Create a new book object with updated sub-story content
                          const updatedBook = {
                            ...book,
                            chapters: book.chapters.map((ch, chIdx) => {
                              if (chIdx !== selectedChapterIndex) return ch
                              
                              // Update the selected chapter
                              if (!ch.reading_version?.sub_stories) return ch
                              
                              return {
                                ...ch,
                                reading_version: {
                                  ...ch.reading_version,
                                  sub_stories: ch.reading_version.sub_stories.map((ss, ssIdx) => {
                                    if (ssIdx !== selectedSubStoryIndex) return ss
                                    
                                    // Update the selected sub-story
                                    const updatedContent = e.target.value
                                    console.log(`📝 Updating sub-story ${ss.sub_story_number} content:`, {
                                      oldLength: ss.content?.length || 0,
                                      newLength: updatedContent.length,
                                      preview: updatedContent.substring(0, 50)
                                    })
                                    
                                    return {
                                      ...ss,
                                      content: updatedContent
                                    }
                                  })
                                }
                              }
                            })
                          }
                          
                          setBook(updatedBook)
                        }}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        rows={6}
                        placeholder="Enter the mini story content for this sub-story..."
                      />
                    </div>
                  )}

                  {/* Dialogue Editor */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Dialogue
                    </label>
                    <textarea
                      value={currentPage.dialogue}
                      onChange={(e) => updatePageSection('dialogue', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      rows={3}
                      placeholder="Enter dialogue for this page..."
                    />
                  </div>

                  {/* Illustration Prompt Editor */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Illustration Prompt
                    </label>
                    <textarea
                      value={currentPage.illustration_prompt}
                      onChange={(e) => updatePageSection('illustration_prompt', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      rows={5}
                      placeholder="Describe the illustration for this page..."
                    />
                  </div>

                  {/* Image Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Illustration Image
                    </label>
                    <div className="flex items-center gap-4">
                      <label className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors">
                        {uploadingImage ? 'Uploading...' : '📤 Upload Image'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                          disabled={uploadingImage}
                        />
                      </label>
                      {currentPage.illustration_image && (
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          ✓ Image uploaded
                        </span>
                      )}
                    </div>
                    {currentPage.illustration_image && (
                      <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 break-all">
                        Path: {currentPage.illustration_image}
                      </div>
                    )}
                  </div>
                </div>

                {/* Mini Story Preview - Only show if sub-stories exist */}
                {hasSubStories(currentChapter) && getSubStories(currentChapter)[selectedSubStoryIndex]?.content && (
                  <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h3 className="text-lg font-semibold mb-2 text-blue-800 dark:text-blue-300">
                      📖 Mini Story Content
                    </h3>
                    <p className="text-sm text-blue-700 dark:text-blue-400 whitespace-pre-wrap">
                      {getSubStories(currentChapter)[selectedSubStoryIndex].content}
                    </p>
                  </div>
                )}

                {/* Preview Section */}
                <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">
                    Preview
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex">
                      <span className="font-medium text-gray-700 dark:text-gray-300 w-24">
                        Page:
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        {currentPage.page_number}
                      </span>
                    </div>
                    <div className="flex">
                      <span className="font-medium text-gray-700 dark:text-gray-300 w-24">
                        Dialogue:
                      </span>
                      <span className="text-gray-600 dark:text-gray-400 italic">
                        "{currentPage.dialogue}"
                      </span>
                    </div>
                  </div>
                  </div>
                )
              </div>
            )}
          </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 text-center text-gray-500">
                Select a chapter and page to begin editing
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Fixed Save Button at Bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {saving ? 'Saving changes...' : 'Make sure to save your changes'}
            </div>
            <button
              onClick={saveBook}
              disabled={saving}
              className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg flex items-center gap-2"
            >
              {saving ? (
                <>
                  <span className="animate-spin">⏳</span>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span>💾</span>
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

