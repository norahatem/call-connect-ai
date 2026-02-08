import { Provider } from '@/types';

const businessNames = {
  plumber: [
    "Joe's Emergency Plumbing",
    "QuickFix Plumbing Co.",
    "AquaPro Services",
    "Reliable Pipes & Drains",
    "24/7 Plumber Pros",
    "City Wide Plumbing",
    "Master Drain Solutions",
    "FlowRight Plumbing",
    "The Pipe Doctor",
    "Express Leak Repair",
    "Premium Plumbing LLC",
    "Guardian Plumbing",
    "Royal Flush Plumbers",
    "AllStar Pipe Services",
    "Waterworks Unlimited"
  ],
  dentist: [
    "Bright Smile Dental",
    "Downtown Dental Care",
    "Family Dental Associates",
    "Premier Dentistry",
    "Gentle Touch Dental",
    "SmileCraft Dentistry",
    "ClearView Dental",
    "Advanced Dental Arts",
    "Comfort Dental Group",
    "Healthy Smiles Clinic",
    "Modern Dental Studio",
    "Elite Dental Practice",
    "Wellness Dental Center",
    "Harmony Dental Care",
    "Perfect Teeth Dentistry"
  ],
  salon: [
    "Luxe Hair Studio",
    "The Cutting Edge Salon",
    "Glamour & Grace",
    "Urban Chic Salon",
    "Bella Vita Hair",
    "Polished Look Studio",
    "Style & Co.",
    "Hair Artistry",
    "The Beauty Bar",
    "Radiant Hair Design",
    "Velvet Touch Salon",
    "Shine On Studio",
    "Boulevard Beauty",
    "Mane Attraction",
    "Elegance Hair Lounge"
  ],
  default: [
    "Premier Services Co.",
    "QuickResponse Pro",
    "City Best Services",
    "AllStar Solutions",
    "Reliable Service Group",
    "Express Service Hub",
    "Top Choice Providers",
    "Quality First LLC",
    "Trusted Local Services",
    "Prime Service Center",
    "Community Services Inc.",
    "Professional Solutions",
    "Expert Care Team",
    "ServiceMaster Pro",
    "Local Excellence Co."
  ]
};

const addresses = [
  "123 Main Street",
  "456 Oak Avenue",
  "789 Maple Drive",
  "321 Cedar Lane",
  "654 Pine Street",
  "987 Elm Boulevard",
  "147 Birch Road",
  "258 Willow Way",
  "369 Spruce Circle",
  "741 Ash Court",
  "852 Cherry Lane",
  "963 Walnut Street",
  "159 Hickory Drive",
  "267 Sycamore Ave",
  "378 Poplar Road"
];

function getBusinessCategory(service: string): keyof typeof businessNames {
  const lower = service.toLowerCase();
  if (lower.includes('plumb') || lower.includes('pipe') || lower.includes('drain') || lower.includes('leak')) {
    return 'plumber';
  }
  if (lower.includes('dent') || lower.includes('teeth') || lower.includes('tooth')) {
    return 'dentist';
  }
  if (lower.includes('hair') || lower.includes('salon') || lower.includes('cut') || lower.includes('style')) {
    return 'salon';
  }
  return 'default';
}

function generatePhoneNumber(): string {
  const areaCode = Math.floor(Math.random() * 900) + 100;
  const prefix = Math.floor(Math.random() * 900) + 100;
  const line = Math.floor(Math.random() * 9000) + 1000;
  return `+1 (${areaCode}) ${prefix}-${line}`;
}

export function generateMockProviders(service: string, location: string, searchId: string): Omit<Provider, 'id' | 'created_at'>[] {
  const category = getBusinessCategory(service);
  const names = businessNames[category];
  
  return names.map((name, index) => ({
    search_id: searchId,
    name,
    phone: generatePhoneNumber(),
    rating: parseFloat((3.5 + Math.random() * 1.5).toFixed(1)),
    review_count: Math.floor(Math.random() * 500) + 10,
    distance: parseFloat((0.2 + Math.random() * 8).toFixed(1)),
    address: `${addresses[index]}, ${location}`
  }));
}

export function sortProviders(providers: Provider[]): Provider[] {
  return [...providers].sort((a, b) => {
    // Sort by a combination of rating and distance
    const aScore = (a.rating * 2) - (a.distance * 0.5);
    const bScore = (b.rating * 2) - (b.distance * 0.5);
    return bScore - aScore;
  });
}
