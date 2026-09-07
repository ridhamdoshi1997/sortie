-- Metro-area expansion for location matching.
--
-- The index matched location with ILIKE '%<city>%', so a Toronto search saw only
-- postings whose location literally contains "Toronto". Measured: 80 such rows
-- for the financial-advisor occupation, against 112 more in Markham,
-- Mississauga, Scarborough, North York and the rest of the GTA that were
-- silently dropped.
--
-- That is also the gap against the old live-scrape path, which returned ~113 for
-- the same search: LinkedIn's and Indeed's actors scope by METRO, so a Toronto
-- query returns the whole area. A candidate searching Toronto expects a
-- Mississauga job; every job site works that way.
--
-- Same shape as the occupation taxonomy: a lookup table the search expands
-- through, rather than logic baked into a query. Adding a market is an INSERT.
CREATE TABLE IF NOT EXISTS public.metro_areas (
  city  text NOT NULL,
  metro text NOT NULL,
  PRIMARY KEY (city, metro)
);

CREATE INDEX IF NOT EXISTS metro_areas_city_idx ON public.metro_areas (city);

-- Seeded for the English-language markets this product targets. Cities are
-- stored lower-case and matched as substrings, so "north york" catches
-- "North York, Ontario, Canada".
INSERT INTO public.metro_areas (city, metro) VALUES
  ('toronto','toronto'),('north york','toronto'),('scarborough','toronto'),('etobicoke','toronto'),
  ('mississauga','toronto'),('brampton','toronto'),('markham','toronto'),('vaughan','toronto'),
  ('richmond hill','toronto'),('thornhill','toronto'),('woodbridge','toronto'),('concord','toronto'),
  ('oakville','toronto'),('burlington','toronto'),('milton','toronto'),('pickering','toronto'),
  ('ajax','toronto'),('whitby','toronto'),('oshawa','toronto'),('newmarket','toronto'),('aurora','toronto'),
  ('vancouver','vancouver'),('burnaby','vancouver'),('richmond, bc','vancouver'),('surrey','vancouver'),
  ('coquitlam','vancouver'),('north vancouver','vancouver'),('langley','vancouver'),
  ('montreal','montreal'),('montréal','montreal'),('laval','montreal'),('longueuil','montreal'),
  ('calgary','calgary'),('airdrie','calgary'),
  ('ottawa','ottawa'),('gatineau','ottawa'),('kanata','ottawa'),
  ('new york','new york'),('nyc','new york'),('brooklyn','new york'),('queens','new york'),
  ('manhattan','new york'),('bronx','new york'),('jersey city','new york'),('newark','new york'),
  ('san francisco','san francisco'),('oakland','san francisco'),('san jose','san francisco'),
  ('palo alto','san francisco'),('mountain view','san francisco'),('sunnyvale','san francisco'),
  ('berkeley','san francisco'),('santa clara','san francisco'),('redwood city','san francisco'),
  ('los angeles','los angeles'),('santa monica','los angeles'),('pasadena','los angeles'),
  ('long beach','los angeles'),('burbank','los angeles'),('irvine','los angeles'),
  ('chicago','chicago'),('evanston','chicago'),('naperville','chicago'),
  ('boston','boston'),('cambridge, ma','boston'),('somerville','boston'),('waltham','boston'),
  ('seattle','seattle'),('bellevue','seattle'),('redmond','seattle'),('kirkland','seattle'),
  ('austin','austin'),('dallas','dallas'),('plano','dallas'),('irving','dallas'),
  ('houston','houston'),('atlanta','atlanta'),('denver','denver'),('boulder','denver'),
  ('washington','washington'),('arlington, va','washington'),('bethesda','washington'),('alexandria','washington'),
  ('london','london'),('croydon','london'),('wembley','london'),('stratford','london'),
  ('manchester','manchester'),('birmingham','birmingham'),('edinburgh','edinburgh'),('glasgow','glasgow'),
  ('sydney','sydney'),('parramatta','sydney'),('north sydney','sydney'),
  ('melbourne','melbourne'),('brisbane','brisbane'),('perth','perth'),
  ('mumbai','mumbai'),('navi mumbai','mumbai'),('thane','mumbai'),('pune','pune'),
  ('delhi','delhi'),('new delhi','delhi'),('gurgaon','delhi'),('gurugram','delhi'),('noida','delhi'),('faridabad','delhi'),
  ('bangalore','bangalore'),('bengaluru','bangalore'),
  ('hyderabad','hyderabad'),('chennai','chennai'),('kolkata','kolkata'),('ahmedabad','ahmedabad')
ON CONFLICT DO NOTHING;
