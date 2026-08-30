export type Role = "admin" | "secretary";

export interface AppUser {
  id: string; email: string; role: Role; full_name?: string;
}
export interface Technician {
  id: number; name: string; grade: "فني"|"مشرف"|"مساعد"; route?: string;
  skills?: string[];
}
export interface WorkOrder {
  id: number; wo_number: string; status: string;
  created_date?: string; expected_delivery?: string; completion_date?: string;
  chk_client: boolean; chk_quality: boolean; chk_assembly: boolean;
}
export interface Attendance {
  id: number; tech_id: number; date: string;
  status: "حاضر"|"غياب"|"أجازة"|"مأمورية";
  technician?: Technician;
}
export interface Permission {
  id: number; tech_id: number; date: string; permission_type: string;
  technician?: Technician;
}
export interface Overtime {
  id: number; tech_id: number; date: string; has_overtime: boolean;
  technician?: Technician;
}
export interface Purchase {
  id: number; wo_id?: number; item_name: string; qty: number;
  request_date?: string; supply_date?: string; status: string;
  image_path?: string; work_order?: WorkOrder;
}
export interface File_ {
  id: number; wo_id?: number; file_name: string; file_type?: string;
  receive_date?: string; delivered_to?: number; delivery_date?: string;
  work_order?: WorkOrder; supervisor?: Technician;
}
export interface Violation {
  id: number; tech_id: number; date?: string; reason?: string; details?: string;
  technician?: Technician;
}
export interface DailyProductivity {
  id: number; tech_id: number; wo_id?: number; work_date: string;
  task: string; notes?: string;
  technician?: Technician; work_order?: WorkOrder;
}
