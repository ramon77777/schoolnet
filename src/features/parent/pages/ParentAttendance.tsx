import AttendanceFoundationPage from "@/features/attendance/components/AttendanceFoundationPage";

export default function ParentAttendance() {
  return (
    <AttendanceFoundationPage
      icon="👨‍👩‍👧"
      eyebrow="Présences & absences"
      title="Suivi de l'assiduité"
      description="Suivez les présences, absences et retards de vos enfants et gérez les justificatifs lorsqu'une situation le nécessite."
      items={[
        {
          title: "Suivre mes enfants",
          description:
            "Consulter l'historique d'assiduité de chaque enfant associé à votre compte.",
        },
        {
          title: "Justifier une absence",
          description:
            "Déposer un motif lorsqu'un enfant est absent ou en retard.",
        },
        {
          title: "Suivre les décisions",
          description:
            "Voir si une justification est en attente, acceptée ou rejetée.",
        },
      ]}
    />
  );
}