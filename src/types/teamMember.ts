export interface TeamMember {
  id: string;
  memberId: string;
  memberName: string;
  email: string;
  activeFlag?: number;
  role?: string;
  totalSales?: number;
  totalWorkDays?: number;
}
