import { NextRequest, NextResponse } from 'next/server'
import { PubSub } from '@google-cloud/pubsub'
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

function loadConfig() {
  const configPath = path.join(process.cwd(), 'config', 'config.yaml')
  let config: any = {}
  
  try {
    if (fs.existsSync(configPath)) {
      const fileContents = fs.readFileSync(configPath, 'utf8')
      config = yaml.load(fileContents) || {}
    }
  } catch (error) {
    console.warn('Failed to load config file, using environment variables:', error)
  }
  
  const projectId = 
    config?.admin?.pubsub?.project_id ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    ''
  
  const topicName = 
    config?.admin?.pubsub?.topic ||
    process.env.PUBSUB_TOPIC ||
    'tiny-tales-books-topic'
  
  return { projectId, topicName }
}

interface TriggerRequest {
  bookSafeTitle: string
  action: 'content' | 'illustrations' | 'both'
  chapterTitle?: string  // 可选：章节标题
}

export async function POST(request: NextRequest) {
  try {
    const body: TriggerRequest = await request.json()
    const { bookSafeTitle, action, chapterTitle } = body

    if (!bookSafeTitle) {
      return NextResponse.json(
        { success: false, error: 'bookSafeTitle is required' },
        { status: 400 }
      )
    }

    const { projectId: PROJECT_ID, topicName: TOPIC_NAME } = loadConfig()

    if (!PROJECT_ID) {
      return NextResponse.json(
        { success: false, error: 'GOOGLE_CLOUD_PROJECT environment variable or config file is not set' },
        { status: 500 }
      )
    }

    // Use the bookSafeTitle as bookTitle directly
    // Pipeline can process any book title, regardless of whether it's registered in Firestore
    // Convert safe_title back to a readable title (replace underscores with spaces)
    const bookTitle = bookSafeTitle.replace(/_/g, ' ')
    const chapterCount = 1 // Default chapter count, pipeline will determine actual count during processing

    // Initialize Pub/Sub
    const pubsub = new PubSub({ projectId: PROJECT_ID })
    const topic = pubsub.topic(TOPIC_NAME)
    
    console.log(`Publishing to Pub/Sub: project=${PROJECT_ID}, topic=${TOPIC_NAME}`)

    // Check if topic exists
    const [topicExists] = await topic.exists()
    if (!topicExists) {
      return NextResponse.json(
        {
          success: false,
          error: `Pub/Sub topic does not exist: ${TOPIC_NAME}. Please create it first.`,
        },
        { status: 404 }
      )
    }

    // Handle 'both' action by publishing two messages sequentially
    if (action === 'both') {
      const messageIds: string[] = []
      
      // First: Trigger audiobook pipeline (content)
      let messageData1: any = {
        book_title: bookTitle,
        chapter_count: chapterCount,
        output_formats: ['pdf', 'html', 'epub'],
      }
      
      if (chapterTitle) {
        messageData1.chapter_title = chapterTitle
        messageData1.regenerate_content = true
      } else {
        messageData1.regenerate_content = true
      }
      
      const messageBuffer1 = Buffer.from(JSON.stringify(messageData1))
      const messageId1 = await topic.publishMessage({
        data: messageBuffer1,
        attributes: {
          action: 'content',
          book_safe_title: bookSafeTitle,
        },
      })
      messageIds.push(messageId1)
      
      // Second: Trigger picture book pipeline (illustrations)
      let messageData2: any = {
        book_title: bookTitle,
        chapter_count: chapterCount,
        output_formats: ['pdf', 'html', 'epub'],
      }
      
      if (chapterTitle) {
        messageData2.chapter_title = chapterTitle
        messageData2.regenerate_illustrations_only = true
      } else {
        messageData2.regenerate_illustrations_only = true
      }
      
      const messageBuffer2 = Buffer.from(JSON.stringify(messageData2))
      const messageId2 = await topic.publishMessage({
        data: messageBuffer2,
        attributes: {
          action: 'illustrations',
          book_safe_title: bookSafeTitle,
        },
      })
      messageIds.push(messageId2)
      
      const message = chapterTitle
        ? `Both pipelines triggered successfully for chapter: ${chapterTitle} (audiobook first, then picture book)`
        : `Both pipelines triggered successfully (audiobook first, then picture book)`
      
      return NextResponse.json({
        success: true,
        message,
        messageIds,
        bookTitle,
        chapterTitle: chapterTitle || null,
      })
    }
    
    // Prepare message data based on action (for single pipeline)
    let messageData: any = {
      book_title: bookTitle,
      chapter_count: chapterCount,
      output_formats: ['pdf', 'html', 'epub'],
    }

    // If chapter title is specified, process single chapter
    if (chapterTitle) {
      messageData.chapter_title = chapterTitle
      if (action === 'illustrations') {
        messageData.regenerate_illustrations_only = true
      } else if (action === 'content') {
        messageData.regenerate_content = true
      }
    } else {
      // Process entire book
      if (action === 'illustrations') {
        // For illustration regeneration, we need to signal that we only want to regenerate illustrations
        // The pipeline worker should handle this by calling generate_illustrations_and_recompile
        messageData.regenerate_illustrations_only = true
      } else if (action === 'content') {
        // For content regeneration, we want to re-run the full content simplification process
        // This will regenerate narration_version and reading_version
        messageData.regenerate_content = true
      }
    }

    // Publish message to Pub/Sub
    const messageBuffer = Buffer.from(JSON.stringify(messageData))
    const messageId = await topic.publishMessage({
      data: messageBuffer,
      attributes: {
        action: action,
        book_safe_title: bookSafeTitle,
      },
    })

    const message = chapterTitle 
      ? `Pipeline ${action === 'content' ? 'content regeneration' : 'illustration regeneration'} triggered successfully for chapter: ${chapterTitle}`
      : `Pipeline ${action === 'content' ? 'content regeneration' : 'illustration regeneration'} triggered successfully`
    
    return NextResponse.json({
      success: true,
      message,
      messageId,
      bookTitle,
      chapterTitle: chapterTitle || null,
    })
  } catch (error: any) {
    console.error('Error triggering pipeline:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to trigger pipeline',
      },
      { status: 500 }
    )
  }
}

