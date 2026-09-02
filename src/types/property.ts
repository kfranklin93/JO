/**
 * Property Request Types
 * 
 * Types for property search criteria and seller information.
 * Used in lead forms to capture buyer/seller preferences.
 */

/**
 * Property type classification
 */
export enum PropertyType {
  SINGLE_FAMILY = 'single_family',
  CONDO = 'condo',
  TOWNHOUSE = 'townhouse',
  MULTI_FAMILY = 'multi_family',
  LAND = 'land',
  COMMERCIAL = 'commercial',
}

/**
 * Buyer/Seller preferences and requirements
 */
export interface PropertyRequest {
  // Common Fields
  propertyType: PropertyType[];
  
  // Location Preferences
  preferredLocations: string[];      // City, neighborhood, zip codes
  maxCommuteMinutes?: number;
  
  // Buyer-Specific Fields
  priceRangeMin?: number;
  priceRangeMax?: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFeetMin?: number;
  squareFeetMax?: number;
  mustHaveFeatures?: string[];       // Pool, garage, yard, etc.
  
  // Seller-Specific Fields
  currentPropertyAddress?: string;
  estimatedValue?: number;
  reasonForSelling?: string;
  idealSaleDate?: Date;
  
  // Additional Context
  additionalNotes?: string;
  preApproved?: boolean;             // For buyers
  workingWithAgent?: boolean;
}

/**
 * Property request creation (partial for multi-step forms)
 */
export type CreatePropertyRequestInput = Partial<PropertyRequest>;

