// Second seed pass: DC's animated original movie line, Marvel's animated
// direct-to-video features, and obscure/older live-action Marvel & DC films
// not covered by scripts/seed-marvel-dc.js. Same conventions as that script.
'use strict';
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data.json');
const IMG = (file) => `public/images/${file}`;
const DEFAULT_POSTER = IMG('default.webp');

const NEW_MOVIES = [
    // ---- DC Universe Animated Original Movies ----
    { title: 'Superman: Doomsday', releaseDate: '18 Sep 2007', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Bruce Timm', role: 'Director' }] },
    { title: 'Justice League: The New Frontier', releaseDate: '25 Feb 2008', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Dave Bullock', role: 'Director' }] },
    { title: 'Wonder Woman', releaseDate: '23 Feb 2009', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Lauren Montgomery', role: 'Director' }] },
    { title: 'Green Lantern: First Flight', releaseDate: '28 Jul 2009', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Lauren Montgomery', role: 'Director' }] },
    { title: 'Superman/Batman: Public Enemies', releaseDate: '9 Sep 2009', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Sam Liu', role: 'Director' }] },
    { title: 'Justice League: Crisis on Two Earths', releaseDate: '27 Feb 2010', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Sam Liu', role: 'Director' }, { name: 'Lauren Montgomery', role: 'Director' }] },
    { title: 'Superman/Batman: Apocalypse', releaseDate: '28 Sep 2010', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Lauren Montgomery', role: 'Director' }] },
    { title: 'All-Star Superman', releaseDate: '22 Feb 2011', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Sam Liu', role: 'Director' }] },
    { title: 'Green Lantern: Emerald Knights', releaseDate: '6 Jun 2011', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Lauren Montgomery', role: 'Director' }, { name: 'Jay Oliva', role: 'Director' }] },
    { title: 'Batman: Year One', releaseDate: '18 Oct 2011', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Sam Liu', role: 'Director' }, { name: 'Lauren Montgomery', role: 'Director' }] },
    { title: 'Justice League: Doom', releaseDate: '28 Feb 2012', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Lauren Montgomery', role: 'Director' }] },
    { title: 'Superman vs. The Elite', releaseDate: '12 Jun 2012', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Michael Chang', role: 'Director' }] },
    { title: 'Batman: The Dark Knight Returns, Part 1', releaseDate: '25 Sep 2012', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Jay Oliva', role: 'Director' }] },
    { title: 'Batman: The Dark Knight Returns, Part 2', releaseDate: '29 Jan 2013', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Jay Oliva', role: 'Director' }] },
    { title: 'Batman: Assault on Arkham', releaseDate: '12 Aug 2014', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Jay Oliva', role: 'Director' }, { name: 'Ethan Spaulding', role: 'Director' }] },
    { title: 'Batman vs. Robin', releaseDate: '14 Apr 2015', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Jay Oliva', role: 'Director' }] },
    { title: 'Justice League: Gods and Monsters', releaseDate: '28 Jul 2015', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Sam Liu', role: 'Director' }] },
    { title: 'Batman: Bad Blood', releaseDate: '18 Jan 2016', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Jay Oliva', role: 'Director' }] },
    { title: 'Justice League Dark', releaseDate: '13 Jan 2017', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Jay Oliva', role: 'Director' }] },
    { title: 'Batman and Harley Quinn', releaseDate: '13 Aug 2017', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Sam Liu', role: 'Director' }] },
    { title: 'Suicide Squad: Hell to Pay', releaseDate: '20 Mar 2018', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Sam Liu', role: 'Director' }] },
    { title: 'Batman Ninja', releaseDate: '8 May 2018', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Junpei Mizusaki', role: 'Director' }] },
    { title: 'Batman: Gotham by Gaslight', releaseDate: '23 Jan 2018', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Sam Liu', role: 'Director' }] },
    { title: 'Justice League vs. the Fatal Five', releaseDate: '30 Jul 2019', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Sam Liu', role: 'Director' }] },
    { title: 'Wonder Woman: Bloodlines', releaseDate: '2 Aug 2019', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Justin Copeland', role: 'Director' }] },
    { title: 'Batman: Hush', releaseDate: '21 Jul 2019', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Justin Copeland', role: 'Director' }] },
    { title: 'Superman: Red Son', releaseDate: '23 Feb 2020', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Sam Liu', role: 'Director' }] },
    { title: 'Justice League Dark: Apokolips War', releaseDate: '5 May 2020', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Matt Peters', role: 'Director' }, { name: 'Christina Sotta', role: 'Director' }] },
    { title: 'Batman: Soul of the Dragon', releaseDate: '12 Jan 2021', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Sam Liu', role: 'Director' }] },
    { title: 'Batman: The Long Halloween, Part One', releaseDate: '22 Jun 2021', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Chris Palmer', role: 'Director' }] },
    { title: 'Batman: The Long Halloween, Part Two', releaseDate: '27 Jul 2021', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Chris Palmer', role: 'Director' }] },
    { title: 'Injustice', releaseDate: '19 Oct 2021', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Matt Peters', role: 'Director' }] },
    { title: 'Green Lantern: Beware My Power', releaseDate: '19 Jul 2022', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Jeff Wamester', role: 'Director' }] },
    { title: 'Legion of Super-Heroes', releaseDate: '20 Feb 2023', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Jeff Wamester', role: 'Director' }] },
    { title: 'Justice League: Warworld', releaseDate: '11 Apr 2023', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Jeff Wamester', role: 'Director' }] },
    { title: 'Justice League: Crisis on Infinite Earths Part One', releaseDate: '9 Jan 2024', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Jim Krieg', role: 'Director' }] },
    { title: 'Justice League: Crisis on Infinite Earths Part Two', releaseDate: '30 Apr 2024', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Jim Krieg', role: 'Director' }] },
    { title: 'Justice League: Crisis on Infinite Earths Part Three', releaseDate: '9 Jul 2024', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Jim Krieg', role: 'Director' }] },

    // ---- Marvel animated direct-to-video features ----
    { title: 'Ultimate Avengers 2', releaseDate: '8 Aug 2006', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Will Meugniot', role: 'Director' }, { name: 'Dick Sebast', role: 'Director' }] },
    { title: 'The Invincible Iron Man', releaseDate: '23 Jan 2007', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Frank Paur', role: 'Director' }, { name: 'Patrick Archibald', role: 'Director' }] },
    { title: 'Doctor Strange: The Sorcerer Supreme', releaseDate: '6 Feb 2007', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Frank Paur', role: 'Director' }] },
    { title: 'Next Avengers: Heroes of Tomorrow', releaseDate: '25 Nov 2008', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Jay Oliva', role: 'Director' }] },
    { title: 'Hulk Vs', releaseDate: '28 Jan 2009', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Frank Paur', role: 'Director' }, { name: 'Sam Liu', role: 'Director' }] },
    { title: 'Thor: Tales of Asgard', releaseDate: '6 Mar 2011', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Sam Liu', role: 'Director' }] },
    { title: 'Iron Man & Hulk: Heroes United', releaseDate: '5 Mar 2013', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Leo Riley', role: 'Director' }] },
    { title: 'Iron Man & Captain America: Heroes United', releaseDate: '4 Nov 2014', poster: DEFAULT_POSTER,
        cast: [], crew: [{ name: 'Leo Riley', role: 'Director' }] },

    // ---- Obscure / older live-action Marvel & DC ----
    { title: 'Supergirl', releaseDate: '21 Nov 1984', poster: DEFAULT_POSTER,
        cast: [{ name: 'Helen Slater', role: 'Kara Zor-El / Supergirl' }],
        crew: [{ name: 'Jeannot Szwarc', role: 'Director' }] },
    { title: 'Swamp Thing', releaseDate: '19 Feb 1982', poster: DEFAULT_POSTER,
        cast: [{ name: 'Ray Wise', role: 'Dr. Alec Holland / Swamp Thing' }],
        crew: [{ name: 'Wes Craven', role: 'Director' }] },
    { title: 'The Return of Swamp Thing', releaseDate: '12 May 1989', poster: DEFAULT_POSTER,
        cast: [{ name: 'Dick Durock', role: 'Swamp Thing' }],
        crew: [{ name: 'Jim Wynorski', role: 'Director' }] },
    { title: 'Steel', releaseDate: '15 Aug 1997', poster: DEFAULT_POSTER,
        cast: [{ name: 'Shaquille O’Neal', role: 'John Henry Irons / Steel' }],
        crew: [{ name: 'Kenneth Johnson', role: 'Director' }] },
    { title: 'Catwoman', releaseDate: '23 Jul 2004', poster: DEFAULT_POSTER,
        cast: [{ name: 'Halle Berry', role: 'Patience Phillips / Catwoman' }],
        crew: [{ name: 'Pitof', role: 'Director' }] },
    { title: 'Elektra', releaseDate: '14 Jan 2005', poster: DEFAULT_POSTER,
        cast: [{ name: 'Jennifer Garner', role: 'Elektra Natchios' }],
        crew: [{ name: 'Rob Bowman', role: 'Director' }] },
    { title: 'Howard the Duck', releaseDate: '1 Aug 1986', poster: DEFAULT_POSTER,
        cast: [{ name: 'Lea Thompson', role: 'Beverly Switzler' }],
        crew: [{ name: 'Willard Huyck', role: 'Director' }] },
    { title: 'Captain America', releaseDate: '14 Dec 1990', poster: DEFAULT_POSTER,
        cast: [{ name: 'Matt Salinger', role: 'Steve Rogers / Captain America' }],
        crew: [{ name: 'Albert Pyun', role: 'Director' }] },
    { title: 'Captain America', releaseDate: '1944', poster: DEFAULT_POSTER,
        cast: [{ name: 'Dick Purcell', role: 'Grant Gardner / Captain America' }],
        crew: [{ name: 'Elmer Clifton', role: 'Director' }, { name: 'John English', role: 'Director' }] },
];

function main() {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const data = JSON.parse(raw);

    const existingTitles = new Set(data.movies.map((m) => m.title.toLowerCase()));
    let nextId = data.movies.reduce((max, m) => Math.max(max, parseInt(m.id, 10) || 0), 0) + 1;

    let added = 0;
    let skipped = 0;
    for (const entry of NEW_MOVIES) {
        if (existingTitles.has(entry.title.toLowerCase())) {
            skipped += 1;
            continue;
        }
        data.movies.push({ id: nextId.toString(), ...entry });
        existingTitles.add(entry.title.toLowerCase());
        nextId += 1;
        added += 1;
    }

    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    console.log(`Added ${added} movies, skipped ${skipped} duplicates. Total: ${data.movies.length}`);
}

main();
