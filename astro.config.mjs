// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	site: 'https://docs.memaudit.dev',
	integrations: [
		starlight({
			title: 'memaudit docs',
			description:
				'Reference documentation for memauditd, the read-only host agent for measuring cold memory, stranded DRAM, and KV-cache waste on Linux.',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/memaudit/memaudit' },
			],
			sidebar: [
				{
					label: 'Reference',
					items: [
						{ label: 'Config reference', slug: 'config-reference' },
						{ label: 'Architecture', slug: 'architecture' },
						{ label: 'Troubleshooting', slug: 'troubleshooting' },
					],
				},
			],
		}),
	],
});
