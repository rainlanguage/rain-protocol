<script>
	import Tailwindcss from './Tailwindcss.svelte'
	import Nav from './nav/Nav.svelte'

	export let name;
</script>

<Tailwindcss />
<main>
	<Nav />
	<h1>Hello {name}!</h1>
	<p>Visit the <a href="https://svelte.dev/tutorial">Svelte tutorial</a> to learn how to build Svelte apps.</p>
</main>
