<!--
	The flow of youth through the section over the coming terms: a bar each way per term (moving up into
	the unit from the section below, and out of it), the expected size after each term, and which patrols
	lose youth, to help decide where those coming in go.
-->
<script lang="ts">
	import { monthYear } from '#lib/model/dates.js';
	import type { FlowMove, Term } from '#lib/model/insights/sectionFlow.js';
	import type { SectionFlowReport } from '#lib/services/insights.js';
	import { titleCase } from '#lib/model/util.js';

	let { report }: { report: SectionFlowReport } = $props();

	const flow = $derived(report.flow);
	const largest = $derived(
		Math.max(1, ...flow.terms.flatMap((t) => [t.arrivals.length, t.departures.length]))
	);
	const width = (count: number) => `${(100 * count) / largest}%`;
	const termName = (t: Term) => `Term ${t.term} ${t.year}`;
	const shortTerm = (t: Term) => `T${t.term} ${String(t.year).slice(2)}`;
	const sectionName = (section: string) => `${titleCase(section)}s`;
	const when = (m: FlowMove) => (m.overdue ? 'due now' : monthYear(m.date));
	const termOfMove = (m: FlowMove) =>
		flow.terms.find((t) => m.overdue || (m.date >= t.start && m.date < t.end))!;
	const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
	const last = $derived(flow.terms[flow.terms.length - 1]);
</script>

<p class="muted">
	Who's expected to move up over the next {flow.terms.length} terms, from their dates of birth:
	{sectionName(report.section)} move up at {report.hereRules.moveUpAgeYears}{#if report.belowRules},
		and {sectionName(report.belowSection)} at {report.belowRules.moveUpAgeYears}{/if}. Terms are
	taken as quarters of the year.
</p>

{#if !report.belowSection}
	<div class="alert alert-info small">
		Joeys have no section below, so only youth moving up show.
	</div>
{:else if !report.belowRules}
	<div class="alert alert-info small">
		{#if report.unreadable.length > 0}
			Terrain wouldn't list the youth of {report.unreadable.join(', ')}, so only youth moving up out
			of the unit show.
		{:else}
			Youth coming up from the {sectionName(report.belowSection)} show once you have a leader role in
			a
			{titleCase(report.belowSection)} unit in this group. For now, only youth moving up out of the unit
			show.
		{/if}
	</div>
{/if}

<div class="card flow-card section-gap">
	<div class="flow-summary">
		<div>
			<div class="small muted">Youth now</div>
			<div class="big">{flow.current}</div>
		</div>
		<div class="arrow" aria-hidden="true">→</div>
		<div>
			<div class="small muted">After {termName(last)}</div>
			<div class="big">{last.sizeAfter}</div>
		</div>
	</div>

	<div class="legend small" aria-hidden="true">
		<span><i class="key out"></i> Moving up out</span>
		<span
			><i class="key in"></i> Coming up from {report.belowRules
				? sectionName(report.belowSection)
				: 'below'}</span
		>
	</div>

	<ul class="chart" aria-label="Youth moving in and out each term">
		{#each flow.terms as term (term.start)}
			<li>
				<details>
					<summary
						aria-label="{termName(term)}: {term.arrivals.length} in, {term.departures
							.length} out, {term.sizeAfter} youth after"
					>
						<span class="term"
							><span class="wide-only">{termName(term)}</span><span class="narrow-only"
								>{shortTerm(term)}</span
							></span
						>
						<span class="side out-side">
							<span class="count"
								>{term.departures.length > 0 ? `−${term.departures.length}` : ''}</span
							>
							<span
								class="bar out"
								style:width={width(term.departures.length)}
								title={term.departures.map((m) => m.name).join(', ')}
							></span>
						</span>
						<span class="side in-side">
							<span
								class="bar in"
								style:width={width(term.arrivals.length)}
								title={term.arrivals.map((m) => m.name).join(', ')}
							></span>
							<span class="count">{term.arrivals.length > 0 ? `+${term.arrivals.length}` : ''}</span
							>
						</span>
						<span class="size">{term.sizeAfter}</span>
					</summary>
					<div class="moves small">
						{#if term.departures.length === 0 && term.arrivals.length === 0}
							<div class="muted">No one expected to move this term.</div>
						{/if}
						{#if term.departures.length > 0}
							<div class="strong">Moving up out</div>
							<ul class="plain">
								{#each term.departures as m (m.id)}
									<li>
										{m.name} <span class="muted">· {m.group || 'no patrol'} · {when(m)}</span>
									</li>
								{/each}
							</ul>
						{/if}
						{#if term.arrivals.length > 0}
							<div class="strong">Coming in</div>
							<ul class="plain">
								{#each term.arrivals as m (m.id)}
									<li>{m.name} <span class="muted">· {m.group} · {when(m)}</span></li>
								{/each}
							</ul>
						{/if}
					</div>
				</details>
			</li>
		{/each}
	</ul>
	<div class="small muted chart-foot">
		Tap a term for names. The number on the right is the youth expected in the unit after it.
	</div>
</div>

{#if flow.patrols.length > 0}
	<h3>Patrols</h3>
	<p class="muted">
		How each patrol changes as youth move up over the {flow.terms.length} terms. Those left smallest are
		first: the likeliest places for youth coming in.
	</p>
	<div class="table-scroll section-gap">
		<table class="table patrols">
			<thead>
				<tr>
					<th>Patrol</th>
					<th class="num">Now</th>
					<th>Moving up</th>
					<th class="num">After</th>
				</tr>
			</thead>
			<tbody>
				{#each flow.patrols as patrol (patrol.patrol)}
					<tr>
						<td>
							<strong>{patrol.patrol}</strong>
							{#if patrol.leaving.length > 0}<span class="badge shrinking"
									>−{patrol.leaving.length}</span
								>{/if}
						</td>
						<td class="num">{patrol.now}</td>
						<td class="small">
							{#if patrol.leaving.length === 0}
								<span class="muted">No one</span>
							{:else}
								{#each patrol.leaving as m, i (m.id)}{i > 0 ? ', ' : ''}{m.name}
									<span class="muted">({shortTerm(termOfMove(m))})</span>{/each}
							{/if}
						</td>
						<td class="num strong">{patrol.after}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

{#if flow.unknownHere > 0 || flow.unknownBelow > 0 || flow.alreadyHere > 0}
	<ul class="small muted notes">
		{#if flow.unknownHere > 0}
			<li>
				{plural(flow.unknownHere, 'youth')} in the unit {flow.unknownHere === 1 ? 'has' : 'have'} no date
				of birth in Terrain, so can't be placed in a term.
			</li>
		{/if}
		{#if flow.unknownBelow > 0}
			<li>
				{plural(flow.unknownBelow, 'youth')} in the {sectionName(report.belowSection)}
				{flow.unknownBelow === 1 ? 'has' : 'have'} no date of birth in Terrain.
			</li>
		{/if}
		{#if flow.alreadyHere > 0}
			<li>
				{plural(flow.alreadyHere, 'youth')} in the {sectionName(report.belowSection)}
				{flow.alreadyHere === 1 ? 'is' : 'are'} already in this unit too, so {flow.alreadyHere === 1
					? "isn't"
					: "aren't"} counted coming in.
			</li>
		{/if}
	</ul>
{/if}

<style>
	/* Arrivals and departures, a diverging pair validated for colour vision deficiency in both themes */
	.flow-card {
		--flow-in: var(--tint);
		--flow-out: #c77c12;
	}

	.flow-summary {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.big {
		font-size: 1.6rem;
		font-weight: 700;
		line-height: 1.1;
	}

	.arrow {
		color: var(--muted);
		font-size: 1.3rem;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		margin: 0.75rem 0 0.25rem;
		color: var(--text-2);
	}

	.key {
		display: inline-block;
		width: 0.7rem;
		height: 0.7rem;
		margin-right: 0.2rem;
		border-radius: 2px;
		vertical-align: -0.05rem;
	}

	.key.in,
	.bar.in {
		background: var(--flow-in);
	}

	.key.out,
	.bar.out {
		background: var(--flow-out);
	}

	.chart {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.chart li + li {
		border-top: 1px solid var(--border-soft);
	}

	summary {
		display: grid;
		grid-template-columns: 6.5rem 1fr 1fr 2rem;
		align-items: center;
		min-height: 44px;
		cursor: pointer;
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:hover {
		background: var(--hover);
	}

	.term {
		font-size: 0.85rem;
		font-weight: 600;
	}

	.side {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		height: 1.1rem;
	}

	/* Departures grow left from the middle line, arrivals right */
	.out-side {
		justify-content: flex-end;
		padding-right: 1px;
		border-right: 1px solid var(--border);
	}

	.in-side {
		padding-left: 1px;
	}

	.bar {
		display: block;
		height: 100%;
		min-width: 0;
		max-width: calc(100% - 1.75rem);
	}

	.bar.out {
		border-radius: 4px 0 0 4px;
	}

	.bar.in {
		border-radius: 0 4px 4px 0;
	}

	.count {
		min-width: 1.4rem;
		color: var(--text-2);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}

	.out-side .count {
		text-align: right;
	}

	.size {
		font-weight: 700;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.moves {
		padding: 0.25rem 0 0.6rem 6.5rem;
	}

	.moves ul {
		margin: 0 0 0.4rem;
	}

	.chart-foot {
		margin-top: 0.4rem;
	}

	.narrow-only {
		display: none;
	}

	@media (max-width: 575.98px) {
		summary {
			grid-template-columns: 3rem 1fr 1fr 1.75rem;
		}

		.wide-only {
			display: none;
		}

		.narrow-only {
			display: inline;
		}

		.moves {
			padding-left: 0;
		}
	}

	.patrols td {
		vertical-align: top;
	}

	.shrinking {
		margin-left: 0.3rem;
		background: var(--alert-warning-bg);
		color: var(--alert-warning-text);
	}

	.notes {
		margin-top: 0.75rem;
		padding-left: 1.1rem;
	}
</style>
