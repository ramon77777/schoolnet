// src/routes/router.tsx
import React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import AuthLayout from "../layouts/AuthLayout";
import DashboardLayout from "../layouts/DashboardLayout";
import LoginPage from "../features/auth/pages/LoginPage";

import { ProtectedRoute, RoleGate } from "./guards";


// Admin
import AdminDashboard from "../features/admin/pages/AdminDashboard";
import AdminUsers from "../features/admin/pages/AdminUsers";
import AdminClasses from "../features/admin/pages/AdminClasses";
import AdminContent from "../features/admin/pages/AdminContent";
import AdminSettings from "../features/admin/pages/AdminSettings";
import AdminSchoolYears from "@/features/admin/pages/AdminSchoolYears";
import AdminAverages from "@/features/admin/pages/AdminAverages";
import AdminPublicSite from "@/features/admin/pages/AdminPublicSite";
import AdminAttendance from "@/features/admin/pages/AdminAttendance";

// Teacher
import TeacherCourses from "../features/teacher/pages/TeacherCourses";
import TeacherClasses from "../features/teacher/pages/TeacherClasses";
import TeacherAssessments from "../features/teacher/pages/TeacherAssessments";
import TeacherAssessmentCreate from "../features/teacher/pages/TeacherAssessmentCreate";
import TeacherAssessmentDetail from "../features/teacher/pages/TeacherAssessmentDetail";
import TeacherAssessmentEdit from "../features/teacher/pages/TeacherAssessmentEdit";
import TeacherGrading from "../features/teacher/pages/TeacherGrading";
import TeacherGradingDetail from "../features/teacher/pages/TeacherGradingDetail";
import TeacherCourseDetail from "../features/teacher/pages/TeacherCourseDetail";
import TeacherDashboard from "@/features/teacher/pages/TeacherDashboard";
import TeacherAverages from "@/features/teacher/pages/TeacherAverages";
import TeacherAttendance from "@/features/teacher/pages/TeacherAttendance";
import TeacherTimetable from "@/features/teacher/pages/TeacherTimetable";

// Student
import StudentCourses from "../features/student/pages/StudentCourses";
import StudentHomework from "../features/student/pages/StudentHomework";
import StudentProgress from "../features/student/pages/StudentProgress";
import StudentAverages from "../features/student/pages/StudentAverages";
import StudentAssessments from "../features/student/pages/StudentAssessments";
import StudentAssessmentTake from "../features/student/pages/StudentAssessmentTake";
import StudentAssessmentResult from "../features/student/pages/StudentAssessmentResult";
import StudentCourseDetail from "../features/student/pages/StudentCourseDetail";
import StudentAssessmentDetails from "../features/student/pages/StudentAssessmentDetails";
import StudentHomeworkDetail from "../features/student/pages/StudentHomeworkDetail";
import StudentDashboard from "@/features/student/pages/StudentDashboard";
import StudentAttendance from "@/features/student/pages/StudentAttendance";

// Parent
import ParentHome from "../features/parent/pages/ParentHome";
import ParentChildren from "../features/parent/pages/ParentChildren";
import ParentDeadlines from "../features/parent/pages/ParentDeadlines";
import ParentResults from "../features/parent/pages/ParentResults";
import ParentResultsDetail from "../features/parent/pages/ParentResultsDetail";
import ParentAverages from "../features/parent/pages/ParentAverages";
import ParentAttendance from "@/features/parent/pages/ParentAttendance";

import AppIndexRedirect from "./AppIndexRedirect";


import PublicLayout from "../layouts/PublicLayout";
import PublicHome from "../features/public/pages/PublicHome";
import PublicLibrary from "../features/public/pages/PublicLibrary";
import PublicLevels from "../features/public/pages/PublicLevels";
import PublicPricing from "../features/public/pages/PublicPricing";
import PublicAbout from "../features/public/pages/PublicAbout";
import PublicContact from "../features/public/pages/PublicContact";
import MessagingPage from "../features/messages/pages/MessagingPage";
import ClassFeedPage from "@/features/class-posts/pages/ClassFeedPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <PublicLayout />,
    children: [
      { index: true, element: <PublicHome /> },
      { path: "bibliotheque", element: <PublicLibrary /> },
      { path: "niveaux", element: <PublicLevels /> },
      { path: "tarifs", element: <PublicPricing /> },
      { path: "a-propos", element: <PublicAbout /> },
      { path: "contact", element: <PublicContact /> },
    ],
  },

  {
    path: "/auth",
    element: <AuthLayout />,
    children: [{ path: "login", element: <LoginPage /> }],
  },

  {
    path: "/app",
    element: <ProtectedRoute />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { index: true, element: <AppIndexRedirect /> },

          { path: "forbidden", element: <div className="sn-card p-6">⛔ Accès interdit</div> },

          {
            element: <RoleGate allowed={["student"]} />,
            children: [
              {
                path: "student",
                element: <Navigate to="/app/student/dashboard" replace />,
              },

              {
                path: "student/dashboard",
                element: <StudentDashboard />,
              },

              {
                path: "student/courses",
                element: <StudentCourses />,
              },

              {
                path: "student/courses/:courseId",
                element: <StudentCourseDetail />,
              },

              {
                path: "student/quiz",
                element: (
                  <StudentAssessments
                    key="student-quiz"
                    initialFilter="Quiz"
                  />
                ),
              },

              {
                path: "student/homework",
                element: <StudentHomework />,
              },

              {
                path: "student/exams",
                element: (
                  <StudentAssessments
                    key="student-exams"
                    initialFilter="Examen"
                  />
                ),
              },

              {
                path: "student/progress",
                element: <StudentProgress />,
              },

              {
                path: "student/attendance",
                element: <StudentAttendance />,
              },

              {
                path: "student/averages",
                element: <StudentAverages />,
              },

              {
                path: "student/messages",
                element: <MessagingPage />,
              },

              {
                  path: "student/class-feed",
                  element: <ClassFeedPage />,
              },

              // Route conservée pour compatibilité avec les liens existants.
              {
                path: "student/assessments",
                element: (
                  <StudentAssessments
                    key="student-assessments"
                    initialFilter="Tous"
                  />
                ),
              },

              {
                path: "student/assessments/:id",
                element: <StudentAssessmentTake />,
              },

              {
                path: "student/assessments/:id/result",
                element: <StudentAssessmentResult />,
              },

              {
                path: "student/assessments/:id/details",
                element: <StudentAssessmentDetails />,
              },

              {
                path: "student/homework/:id",
                element: <StudentHomeworkDetail />,
              },
            ],
          },

          {
            element: <RoleGate allowed={["parent"]} />,
            children: [
              {
                path: "parent",
                element: <Navigate to="/app/parent/dashboard" replace />,
              },

              {
                path: "parent/dashboard",
                element: <ParentHome />,
              },

              // Ancienne URL conservée pour ne casser aucun lien existant.
              {
                path: "parent/home",
                element: <Navigate to="/app/parent/dashboard" replace />,
              },

              { path: "parent/children", element: <ParentChildren /> },
              { path: "parent/deadlines", element: <ParentDeadlines /> },
              { path: "parent/results", element: <ParentResults /> },
              { path: "parent/results/:id", element: <ParentResultsDetail /> },
              { path: "parent/averages", element: <ParentAverages /> },
              { path: "parent/attendance", element: <ParentAttendance />,},
              { path: "parent/messages", element: <MessagingPage />, },
              { path: "parent/class-feed", element: <ClassFeedPage />, },
            ],
          },

          {
            element: <RoleGate allowed={["teacher"]} />,
            children: [
              {
                path: "teacher",
                element: <Navigate to="/app/teacher/dashboard" replace />,
              },

              {
                path: "teacher/dashboard",
                element: <TeacherDashboard />,
              },

              { path: "teacher/courses", element: <TeacherCourses /> },
              {
                path: "teacher/courses/:courseId",
                element: <TeacherCourseDetail />,
              },

              { path: "teacher/classes", element: <TeacherClasses /> },
              {
                path: "teacher/attendance",
                element: <TeacherAttendance />,
              },

              {
                path: "teacher/timetable",
                element: <TeacherTimetable />,
              },

              {
                path: "teacher/assessments",
                element: <TeacherAssessments />,
              },
              {
                path: "teacher/assessments/new",
                element: <TeacherAssessmentCreate />,
              },
              {
                path: "teacher/assessments/:id",
                element: <TeacherAssessmentDetail />,
              },
              {
                path: "teacher/assessments/:id/edit",
                element: <TeacherAssessmentEdit />,
              },

              { path: "teacher/grading", element: <TeacherGrading /> },
              {
                path: "teacher/grading/:id",
                element: <TeacherGradingDetail />,
              },
              {
                path: "/app/teacher/averages",
                element: <TeacherAverages />,
              },
              {
                path: "teacher/messages",
                element: <MessagingPage />,
              },
              {
                path: "teacher/class-feed",
                element: <ClassFeedPage />,
              },
            ],
          },

          {
            element: <RoleGate allowed={["admin"]} />,
            children: [
              { path: "admin", element: <Navigate to="/app/admin/dashboard" replace /> },
              { path: "admin/dashboard", element: <AdminDashboard /> },
              { path: "admin/users", element: <AdminUsers /> },
              { path: "admin/classes", element: <AdminClasses /> },
              { path: "admin/attendance", element: <AdminAttendance />, },
              { path: "admin/school-years", element: <AdminSchoolYears /> },
              { path: "admin/averages", element: <AdminAverages /> },
              { path: "admin/messages", element: <MessagingPage />,},
              { path: "admin/class-feed", element: <ClassFeedPage />, },
              { path: "admin/content", element: <AdminContent /> },
              { path: "admin/public-site", element: <AdminPublicSite /> },
              { path: "admin/settings", element: <AdminSettings /> },
            ],
          },
        ],
      },
    ],
  },

  { path: "*", element: <div className="p-6">404</div> },
]);
