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
  const [selectedPageIndex, setSelectedPageIndex] = useState(0)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [viewMode, setViewMode] = useState<'edit' | 'render'>('edit')

  useEffect(() => {
    loadBook()
  }, [filename])

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
      
      setBook(data)
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
      const response = await fetch(`/api/books/${filename}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(book),
      })
      
      if (!response.ok) throw new Error('Failed to save book')
      
      alert('Book saved successfully!')
    } catch (error) {
      console.error('Error saving book:', error)
      alert('Failed to save book')
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
      // New format: sub_stories
      let pageIndex = 0
      for (const subStory of chapter.reading_version.sub_stories) {
        const sections = subStory.sections || []
        if (selectedPageIndex < pageIndex + sections.length) {
          const page = sections[selectedPageIndex - pageIndex]
          if (page) {
            ;(page as any)[field] = value
            setBook(updatedBook)
            return
          }
        }
        pageIndex += sections.length
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

  const currentChapter = book.chapters[selectedChapterIndex]
  
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
  
  const sections = currentChapter ? getSections(currentChapter) : []
  const currentPage = sections[selectedPageIndex]

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
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
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : '💾 Save Changes'}
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Chapter Navigation */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
              <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">
                Chapters
              </h2>
              <div className="space-y-2">
                {book.chapters.map((chapter, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setSelectedChapterIndex(index)
                      setSelectedPageIndex(0)
                    }}
                    className={`w-full text-left px-3 py-2 rounded transition-colors ${
                      selectedChapterIndex === index
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {chapter.title}
                  </button>
                ))}
              </div>

              {/* Page Navigation */}
              {currentChapter && sections.length > 0 && (
                <div className="mt-6">
                  <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">
                    Pages ({sections.length})
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
                  <h2 className="text-2xl font-semibold text-gray-800 dark:text-white">
                    Page {currentPage.page_number}
                  </h2>
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
                        onClick={() => setSelectedPageIndex(Math.max(0, selectedPageIndex - 1))}
                        disabled={selectedPageIndex === 0}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ← Previous
                      </button>
                      <button
                        onClick={() => {
                          if (!sections || sections.length === 0) return
                          setSelectedPageIndex(
                            Math.min(
                              sections.length - 1,
                              selectedPageIndex + 1
                            )
                          )
                        }}
                        disabled={
                          !sections || sections.length === 0 ||
                          selectedPageIndex === (sections.length - 1)
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
    </div>
  )
}

