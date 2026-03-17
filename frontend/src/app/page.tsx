import Link from 'next/link'
import { ArrowRightIcon, FileTextIcon, ShieldCheckIcon, UsersIcon } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-10"></div>
        
        <div className="relative pt-16 pb-32 px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl tracking-tight font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
              <span className="block">ระบบบริหารจัดการเอกสาร</span>
              <span className="block text-primary-600">9Tools Document Management</span>
            </h1>
            <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
              ระบบจัดการเอกสารแบบครบวงจรสำหรับฝ่าย GPF และฝ่ายเอกสารที่เกี่ยวข้อง
              พร้อมระบบรักษาความปลอดภัยขั้นสูงและการตรวจสอบย้อนกลับครบถ้วน
            </p>
            <div className="mt-8 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
              <div className="rounded-md shadow">
                <Link
                  href="/auth/login"
                  className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 md:py-4 md:text-lg md:px-10"
                >
                  เริ่มต้นใช้งาน
                  <ArrowRightIcon className="ml-2 h-5 w-5" />
                </Link>
              </div>
              <div className="mt-3 rounded-md shadow sm:mt-0 sm:ml-3">
                <Link
                  href="/about"
                  className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-primary-600 bg-white hover:bg-gray-50 md:py-4 md:text-lg md:px-10"
                >
                  ข้อมูลเพิ่มเติม
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="py-12 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="lg:text-center">
              <h2 className="text-base text-primary-600 font-semibold tracking-wide uppercase">คุณสมบัติหลัก</h2>
              <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                ทุกสิ่งที่คุณต้องการสำหรับการจัดการเอกสาร
              </p>
              <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
                ระบบของเรามีฟีเจอร์ครบครันเพื่อให้การจัดการเอกสารเป็นเรื่องง่ายและปลอดภัย
              </p>
            </div>

            <div className="mt-10">
              <div className="space-y-10 md:space-y-0 md:grid md:grid-cols-3 md:gap-x-8 md:gap-y-10">
                <div className="relative">
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary-500 text-white">
                    <ShieldCheckIcon className="h-6 w-6" />
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">ความปลอดภัยสูง</p>
                  <p className="mt-2 ml-16 text-base text-gray-500">
                    เข้ารหัสไฟล์ AES-256 ระบบยืนยันตัวตน 2 ขั้นตอน และการควบคุมการเข้าถึงแบบละเอียด
                  </p>
                </div>

                <div className="relative">
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary-500 text-white">
                    <FileTextIcon className="h-6 w-6" />
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">จัดการเอกสาร</p>
                  <p className="mt-2 ml-16 text-base text-gray-500">
                    อัปโหลดไฟล์ขนาดใหญ่ จัดการโฟลเดอร์ ค้นหาขั้นสูง และแปลงไฟล์เป็น PDF อัตโนมัติ
                  </p>
                </div>

                <div className="relative">
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary-500 text-white">
                    <UsersIcon className="h-6 w-6" />
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">จัดการผู้ใช้</p>
                  <p className="mt-2 ml-16 text-base text-gray-500">
                    ระบบสิทธิ์ 3 ระดับ บันทึกประวัติการใช้งาน และรายงานสถิติการใช้งานแบบเรียลไทม์
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
