import { normalize } from 'pathe'
import { defu } from 'defu'
import type { Nuxt } from '@nuxt/schema'
import type { NitroConfig } from 'nitropack'
import { createResolver, resolvePath } from '@nuxt/kit'
import { hash } from 'ohash'
import { provider, type ProviderName } from 'std-env'
import type { InputProvider, ImageModuleProvider, ProviderSetup } from './types'
import type { ModuleOptions } from './module'
import { ipxSetup } from './ipx'

// Please add new providers alphabetically to the list below
const BuiltInProviders = [
  'aliyun',
  'awsAmplify',
  'bunny',
  'caisy',
  'cloudflare',
  'cloudimage',
  'cloudinary',
  'contentful',
  'directus',
  'edgio',
  'fastly',
  'glide',
  'gumlet',
  'hygraph',
  'imageengine',
  'imagekit',
  'imgix',
  'ipx',
  'ipxStatic',
  'layer0',
  'netlify',
  'prepr',
  'none',
  'prismic',
  'sanity',
  'storyblok',
  'strapi',
  'twicpics',
  'unsplash',
  'uploadcare',
  'vercel',
  'wagtail',
  'weserv',
  'sirv'
] as const

export type ImageProviderName = typeof BuiltInProviders[number]

export const providerSetup: Partial<Record<ImageProviderName, ProviderSetup>> = {
  // IPX
  ipx: ipxSetup(),
  ipxStatic: ipxSetup({ isStatic: true }),

  // https://vercel.com/docs/more/adding-your-framework#images
  vercel (_providerOptions, moduleOptions, nuxt: Nuxt) {
    nuxt.options.nitro = defu(nuxt.options.nitro, {
      vercel: {
        config: {
          images: {
            domains: moduleOptions.domains,
            minimumCacheTTL: 60 * 5,
            sizes: Array.from(new Set(Object.values(moduleOptions.screens || {})))
          }
        }
      } satisfies NitroConfig['vercel']
    })
  },

  awsAmplify (_providerOptions, moduleOptions, nuxt: Nuxt) {
    nuxt.options.nitro = defu(nuxt.options.nitro, {
      awsAmplify: {
        imageOptimization: {
          path: '/_amplify/image',
          cacheControl: 'public, max-age=300, immutable'
        },
        imageSettings: {
          sizes: Array.from(new Set(Object.values(moduleOptions.screens || {}))),
          formats: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] satisfies NonNullable<NonNullable<NitroConfig['awsAmplify']>['imageSettings']>['formats'],
          minimumCacheTTL: 60 * 5,
          domains: moduleOptions.domains,
          remotePatterns: [], // Provided by domains
          dangerouslyAllowSVG: false // TODO
        }
      }
    })
  }
}

export async function resolveProviders (nuxt: any, options: ModuleOptions): Promise<ImageModuleProvider[]> {
  const providers: ImageModuleProvider[] = []

  for (const key in options) {
    if (BuiltInProviders.includes(key as ImageProviderName)) {
      providers.push(await resolveProvider(nuxt, key, { provider: key, options: options[key] }))
    }
  }

  for (const key in options.providers) {
    providers.push(await resolveProvider(nuxt, key, options.providers[key]))
  }

  return providers
}

export async function resolveProvider (_nuxt: any, key: string, input: InputProvider): Promise<ImageModuleProvider> {
  if (typeof input === 'string') {
    input = { name: input }
  }

  if (!input.name) {
    input.name = key
  }

  if (!input.provider) {
    input.provider = input.name
  }

  const resolver = createResolver(import.meta.url)
  input.provider = BuiltInProviders.includes(input.provider as ImageProviderName)
    ? await resolver.resolve('./runtime/providers/' + input.provider)
    : await resolvePath(input.provider)

  const setup = input.setup || providerSetup[input.name as ImageProviderName]

  return <ImageModuleProvider> {
    ...input,
    setup,
    runtime: normalize(input.provider!),
    importName: `${key}Runtime$${hash(input.provider)}`,
    runtimeOptions: input.options
  }
}

const autodetectableProviders: Partial<Record<ProviderName, ImageProviderName>> = {
  vercel: 'vercel',
  aws_amplify: 'awsAmplify'
}

export function detectProvider (userInput: string = ''): undefined | { provider: string; auto: boolean } {
  if (process.env.NUXT_IMAGE_PROVIDER) {
    return {
      provider: process.env.NUXT_IMAGE_PROVIDER,
      auto: false
    }
  }
  if (userInput && userInput !== 'auto') {
    return {
      provider: userInput,
      auto: false
    }
  }
  const autoDetected = autodetectableProviders[provider]
  if (autoDetected) {
    return {
      provider: autoDetected,
      auto: true
    }
  }
}
