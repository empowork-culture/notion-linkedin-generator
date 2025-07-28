import { NextApiRequest, NextApiResponse } from 'next';                                                                 
     import { Client } from '@notionhq/client';
     import Anthropic from '@anthropic-ai/sdk';

     const notion = new Client({
       auth: process.env.NOTION_API_KEY,
     });

     const anthropic = new Anthropic({
       apiKey: process.env.ANTHROPIC_API_KEY,
     });

     export default async function handler(req: NextApiRequest, res: NextApiResponse) {
       if (req.method !== 'POST') {
         return res.status(405).json({ error: 'Method not allowed' });
       }

       try {
         const { pageId } = req.body;

         if (!pageId) {
           return res.status(400).json({ error: 'Page ID is required' });
         }

         // Récupérer les données de la page Contenu
         const contentData = await getContentWithRelations(pageId);

         // Générer le post avec Claude
         const generatedPost = await generateLinkedInPost(contentData);

         res.status(200).json({
           success: true,
           post: generatedPost,
           context: contentData
         });

       } catch (error) {
         console.error('Error:', error);
         res.status(500).json({ error: 'Internal server error' });
       }
     }

     async function getContentWithRelations(pageId: string) {
       // Récupérer la page principale
       const page = await notion.pages.retrieve({ page_id: pageId });

       // Récupérer les propriétés avec relations
       const pageProperties = await notion.pages.properties.retrieve({
         page_id: pageId,
         property_id: 'title', // Adapter selon vos propriétés
       });

       // Récupérer les relations vers autres databases
       const relations = {
         projets: await getRelatedPages(pageId, 'Projets'), // Nom de votre propriété relation
         prestations: await getRelatedPages(pageId, 'Prestations'),
         contacts: await getRelatedPages(pageId, 'Contacts'),
         organisations: await getRelatedPages(pageId, 'Organisations'),
         wiki: await getRelatedPages(pageId, 'Wiki'),
       };

       return {
         mainPage: page,
         properties: pageProperties,
         relations,
       };
     }

     async function getRelatedPages(pageId: string, relationProperty: string) {
       try {
         const response = await notion.pages.properties.retrieve({
           page_id: pageId,
           property_id: relationProperty,
         });

         if (response.type === 'relation' && response.relation) {
           const relatedPages = [];

           for (const relation of response.relation) {
             const relatedPage = await notion.pages.retrieve({
               page_id: relation.id
             });

             // Récupérer le contenu de la page si c'est une page avec du texte
             const blocks = await notion.blocks.children.list({
               block_id: relation.id,
             });

             relatedPages.push({
               page: relatedPage,
               content: blocks.results,
             });
           }

           return relatedPages;
         }

         return [];
       } catch (error) {
         console.error(`Error fetching relation ${relationProperty}:`, error);
         return [];
       }
     }

     async function generateLinkedInPost(contentData: any) {
       const contextJson = JSON.stringify(contentData, null, 2);

       const message = await anthropic.messages.create({
         model: 'claude-3-5-sonnet-20241022',
         max_tokens: 2000,
         messages: [{
           role: 'user',
           content: `En tant qu'expert en création de contenu LinkedIn, génère un post engageant basé sur ce contexte Notion.

     Contexte complet en JSON :
     ${contextJson}

     Instructions :
     - Utilise les informations des relations (projets, prestations, contacts, etc.)
     - Respecte le ton et la structure définis dans le Wiki
     - Cible l'audience appropriée selon les données
     - Crée un post authentique et engageant
     - Inclus des CTA pertinents si approprié

     Génère uniquement le texte du post LinkedIn, sans formatage markdown.`
         }]
       });

       return message.content[0].type === 'text' ? message.content[0].text : '';
     }
