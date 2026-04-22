// src/routes/router.tsx
import React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import AuthLayout from "../layouts/AuthLayout";
import DashboardLayout from "../layouts/DashboardLayout";
import LoginPage from "../features/auth/pages/LoginPage";

import { ProtectedRoute, RoleGate } from "./guards";

import { useAuth } from "@/lib/auth/AuthProvider";
import { getDefaultPathByRole } from "@/lib/auth";

// Admin
import AdminDashboard from "../features/admin/pages/AdminDashboard";
import AdminUsers from "../features/admin/pages/AdminUsers";
import AdminClasses from "../features/admin/pages/AdminClasses";
import AdminContent from "../features/admin/pages/AdminContent";
import AdminSettings from "../features/admin/pages/AdminSettings";

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

// Student
import StudentCourses from "../features/student/pages/StudentCourses";
import StudentHomework from "../features/student/pages/StudentHomework";
import StudentProgress from "../features/student/pages/StudentProgress";
import StudentAssessments from "../features/student/pages/StudentAssessments";
import StudentAssessmentTake from "../features/student/pages/StudentAssessmentTake";
import StudentAssessmentResult from "../features/student/pages/StudentAssessmentResult";

// Parent
import ParentHome from "../features/parent/pages/ParentHome";
import ParentChildren from "../features/parent/pages/ParentChildren";
import ParentDeadlines from "../features/parent/pages/ParentDeadlines";
import ParentResults from "../features/parent/pages/ParentResults";
import ParentResultsDetail from "../features/parent/pages/ParentResultsDetail";

function AppIndexRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="sn-card p-6">Chargement…</div>;
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  return <Navigate to={getDefaultPathByRole(user.role)} replace />;
}

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/auth/login" replace /> },

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
              { path: "student", element: <Navigate to="/app/student/courses" replace /> },
              { path: "student/courses", element: <StudentCourses /> },
              { path: "student/homework", element: <StudentHomework /> },
              { path: "student/progress", element: <StudentProgress /> },
              { path: "student/assessments", element: <StudentAssessments /> },
              { path: "student/assessments/:id", element: <StudentAssessmentTake /> },
              { path: "student/assessments/:id/result", element: <StudentAssessmentResult /> },
            ],
          },

          {
            element: <RoleGate allowed={["parent"]} />,
            children: [
              { path: "parent", element: <Navigate to="/app/parent/home" replace /> },
              { path: "parent/home", element: <ParentHome /> },
              { path: "parent/children", element: <ParentChildren /> },
              { path: "parent/deadlines", element: <ParentDeadlines /> },
              { path: "parent/results", element: <ParentResults /> },
              { path: "parent/results/:id", element: <ParentResultsDetail /> },
            ],
          },

          {
            element: <RoleGate allowed={["teacher"]} />,
            children: [
              { path: "teacher", element: <Navigate to="/app/teacher/courses" replace /> },
              { path: "teacher/courses", element: <TeacherCourses /> },
              { path: "teacher/courses/:courseId", element: <TeacherCourseDetail /> },

              { path: "teacher/classes", element: <TeacherClasses /> },

              { path: "teacher/assessments", element: <TeacherAssessments /> },
              { path: "teacher/assessments/new", element: <TeacherAssessmentCreate /> },
              { path: "teacher/assessments/:id", element: <TeacherAssessmentDetail /> },
              { path: "teacher/assessments/:id/edit", element: <TeacherAssessmentEdit /> },

              { path: "teacher/grading", element: <TeacherGrading /> },
              { path: "teacher/grading/:id", element: <TeacherGradingDetail /> },
            ],
          },

          {
            element: <RoleGate allowed={["admin"]} />,
            children: [
              { path: "admin", element: <Navigate to="/app/admin/dashboard" replace /> },
              { path: "admin/dashboard", element: <AdminDashboard /> },
              { path: "admin/users", element: <AdminUsers /> },
              { path: "admin/classes", element: <AdminClasses /> },
              { path: "admin/content", element: <AdminContent /> },
              { path: "admin/settings", element: <AdminSettings /> },
            ],
          },
        ],
      },
    ],
  },

  { path: "*", element: <div className="p-6">404</div> },
]);