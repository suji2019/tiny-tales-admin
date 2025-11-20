import { NextRequest, NextResponse } from 'next/server'
import { Firestore } from '@google-cloud/firestore'
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const collection = searchParams.get('collection') || 'books'
    const limit = parseInt(searchParams.get('limit') || '100')
    
    // Load config to get project ID and collection prefix
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
    
    // Get project ID from config or environment variable
    const projectId = 
      config?.admin?.firestore?.project_id ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      ''
    
    if (!projectId) {
      return NextResponse.json(
        { error: 'GOOGLE_CLOUD_PROJECT environment variable or config file is required' },
        { status: 500 }
      )
    }

    // Get collection prefix from config or environment variable, default to 'tiny_tales'
    const collectionPrefix = 
      config?.admin?.firestore?.collection_prefix ||
      process.env.FIRESTORE_COLLECTION_PREFIX ||
      'tiny_tales'

    // Initialize Firestore
    const db = new Firestore({
      projectId: projectId,
    })

    // Collection names
    const booksCollection = `${collectionPrefix}_books`
    const chaptersCollection = `${collectionPrefix}_chapters`
    const pagesCollection = `${collectionPrefix}_pages`
    const stepsCollection = `${collectionPrefix}_processing_steps`
    const subStoriesCollection = `${collectionPrefix}_sub_stories`
    
    let data: any[] = []
    let collectionName = ''
    
    switch (collection) {
      case 'books':
        collectionName = booksCollection
        const booksSnapshot = await db.collection(booksCollection).limit(limit).get()
        data = booksSnapshot.docs.map((doc: any) => ({
          id: doc.id,
          ...doc.data(),
        }))
        break
        
      case 'chapters':
        collectionName = chaptersCollection
        const chaptersSnapshot = await db.collection(chaptersCollection).limit(limit).get()
        data = chaptersSnapshot.docs.map((doc: any) => ({
          id: doc.id,
          ...doc.data(),
        }))
        break
        
      case 'pages':
        collectionName = pagesCollection
        const pagesSnapshot = await db.collection(pagesCollection).limit(limit).get()
        data = pagesSnapshot.docs.map((doc: any) => ({
          id: doc.id,
          ...doc.data(),
        }))
        break
        
      case 'sub_stories':
        collectionName = subStoriesCollection
        try {
          const subStoriesSnapshot = await db.collection(subStoriesCollection).limit(limit).get()
          data = subStoriesSnapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data(),
          }))
        } catch (error: any) {
          // Collection might not exist
          console.warn(`Sub-stories collection not found: ${error.message}`)
          data = []
        }
        break
        
      case 'processing_steps':
        collectionName = stepsCollection
        const stepsSnapshot = await db.collection(stepsCollection).limit(limit).get()
        data = stepsSnapshot.docs.map((doc: any) => ({
          id: doc.id,
          ...doc.data(),
        }))
        break
        
      default:
        return NextResponse.json(
          { error: `Unknown collection: ${collection}` },
          { status: 400 }
        )
    }
    
    // Convert Firestore timestamps to ISO strings
    data = data.map(item => {
      const converted: any = { ...item }
      Object.keys(converted).forEach(key => {
        const value = converted[key]
        if (value && typeof value === 'object' && 'toDate' in value) {
          // Firestore Timestamp
          converted[key] = value.toDate().toISOString()
        } else if (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) {
          // Firestore Timestamp (alternative format)
          converted[key] = new Date(value.seconds * 1000 + value.nanoseconds / 1000000).toISOString()
        }
      })
      return converted
    })
    
    return NextResponse.json({
      collection: collectionName,
      count: data.length,
      data,
    })
  } catch (error: any) {
    console.error('Error fetching Firestore data:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch Firestore data' },
      { status: 500 }
    )
  }
}

