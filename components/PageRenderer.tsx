'use client'

import { useState } from 'react'
import { PageSection } from '@/types/storybook'

interface PageRendererProps {
  page: PageSection
  onImageChange?: (newImagePath: string) => void
  bookSafeTitle?: string
}

export default function PageRenderer({ page, onImageChange, bookSafeTitle }: PageRendererProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [imageError, setImageError] = useState(false)

  // Extract filename from full path for API route
  const getImageUrl = (imagePath?: string) => {
    if (!imagePath) return null
    
    // If it's already a full URL, use it as is
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath
    }
    
    // If it's a GCS key (starts with books/), construct the URL
    if (imagePath.startsWith('books/')) {
      const bucketName = process.env.NEXT_PUBLIC_GCS_BUCKET || ''
      if (bucketName) {
        return `https://storage.googleapis.com/${bucketName}/${imagePath}`
      }
      return `/api/images/${imagePath}`
    }
    
    // Otherwise, use the API route
    return `/api/images/${imagePath}`
  }

  const imageUrl = getImageUrl(page.illustration_image)

  const handleImageClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file || !onImageChange) return

      try {
        setIsUploading(true)
        const formData = new FormData()
        formData.append('file', file)
        // Use bookSafeTitle from props if available
        if (bookSafeTitle) {
          formData.append('bookSafeTitle', bookSafeTitle)
        }

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) throw new Error('Failed to upload image')

        const data = await response.json()
        onImageChange(data.url || data.path)
        setImageError(false)
      } catch (error) {
        console.error('Error uploading image:', error)
        alert('Failed to upload image')
      } finally {
        setIsUploading(false)
      }
    }
    input.click()
  }

  return (
    <div className="w-full max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden">
      {/* Page Number */}
      <div className="px-6 py-3 bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900 dark:to-blue-900 border-b border-gray-200 dark:border-gray-700">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
          Page {page.page_number}
        </span>
      </div>

      {/* Image Section */}
      <div className="relative w-full aspect-[4/3] bg-gray-100 dark:bg-gray-900 flex items-center justify-center overflow-hidden">
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={`Illustration for page ${page.page_number}`}
            className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
            onClick={handleImageClick}
            onError={() => setImageError(true)}
            title="Click to change image"
          />
        ) : (
          <div
            onClick={handleImageClick}
            className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg m-4"
            title="Click to upload image"
          >
            {isUploading ? (
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Uploading...</p>
              </div>
            ) : (
              <>
                <svg
                  className="w-24 h-24 text-gray-400 dark:text-gray-500 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">
                  {imageError ? 'Image not found' : 'No Image'}
                </p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">
                  Click to upload illustration
                </p>
              </>
            )}
          </div>
        )}
        
        {/* Upload indicator overlay */}
        {imageUrl && !imageError && (
          <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
            Click to change
          </div>
        )}
      </div>

      {/* Text Content Section */}
      <div className="p-6 space-y-4">
        {/* Dialogue */}
        {page.dialogue && (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border-l-4 border-blue-500">
            <p className="text-gray-800 dark:text-gray-200 text-lg italic leading-relaxed">
              "{page.dialogue}"
            </p>
          </div>
        )}

        {/* Illustration Prompt (optional, can be hidden in production) */}
        {page.illustration_prompt && (
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
              Illustration Prompt
            </p>
            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
              {page.illustration_prompt}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

